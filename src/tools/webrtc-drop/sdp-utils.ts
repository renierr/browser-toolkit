interface CompressedSDP {
    u: string; // ice-ufrag
    p: string; // ice-pwd
    f: string; // fingerprint
    c: string[]; // candidates (ip:port)
}

/**
 * Compresses an SDP string into a smaller Base64 representation.
 * Focuses on DataChannel essentials for offline/LAN use.
 */
export function compressSDP(sdp: string): string {
    const lines = sdp.split('\n');
    const data: CompressedSDP = { u: '', p: '', f: '', c: [] };
    const candidates: string[] = [];
    
    lines.forEach(l => {
        const line = l.trim();
        if (line.startsWith('a=ice-ufrag:')) data.u = line.split(':')[1].trim();
        else if (line.startsWith('a=ice-pwd:')) data.p = line.split(':')[1].trim();
        else if (line.startsWith('a=fingerprint:sha-256 ')) data.f = line.split('sha-256 ')[1].trim();
        else if (line.startsWith('a=candidate:')) {
            const parts = line.split(' ');
            // Include only 'host' candidates (LAN/Local)
            if (parts[7] === 'host') {
                candidates.push(`${parts[4]}:${parts[5]}`);
            }
        }
    });

    // Deduplicate and prioritize IPv4 (1 colon vs many in IPv6), then limit to 4
    const uniqueCandidates = [...new Set(candidates)];
    data.c = uniqueCandidates
        .sort((a, b) => {
            const aColons = (a.match(/:/g) || []).length;
            const bColons = (b.match(/:/g) || []).length;
            if (aColons === 1 && bColons !== 1) return -1;
            if (aColons !== 1 && bColons === 1) return 1;
            return 0;
        })
        .slice(0, 4);

    return btoa(JSON.stringify(data));
}

/**
 * Decompresses a Base64 SDP representation into a full SDP string.
 */
export function decompressSDP(compressed: string, isOffer: boolean): string {
    const data: CompressedSDP = JSON.parse(atob(compressed));
    const lines = [
        'v=0',
        'o=- 0 0 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=msid-semantic: WMS',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'c=IN IP4 0.0.0.0',
        'a=mid:0',
        `a=setup:${isOffer ? 'actpass' : 'active'}`,
        `a=ice-ufrag:${data.u}`,
        `a=ice-pwd:${data.p}`,
        `a=fingerprint:sha-256 ${data.f}`,
        'a=sctp-port:5000',
        'a=max-message-size:262144'
    ];

    data.c.forEach((c: string) => {
        const lastColon = c.lastIndexOf(':');
        if (lastColon === -1) return;
        const ip = c.substring(0, lastColon);
        const port = c.substring(lastColon + 1);
        lines.push(`a=candidate:1 1 udp 2122260223 ${ip} ${port} typ host generation 0`);
    });

    return lines.join('\r\n') + '\r\n';
}
