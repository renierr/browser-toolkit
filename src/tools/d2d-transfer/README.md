# D2D Transfer via Sound & Light

Device-to-device data transfer using near-ultrasonic audio or light pulses via camera. No network, Bluetooth, or cables needed.

## How It Works

One device acts as **Sender**, the other as **Receiver**. The sender encodes data as physical signals (sound or light), and the receiver captures and decodes them.

### Methods

#### Sound Wave (Near-Ultrasonic FSK)

- **Frequencies:** 18.5 kHz (bit 0) and 19.5 kHz (bit 1)
- **Bit rate:** 100 bps (10 ms per bit)
- **Repeats:** 3 passes per frame for reliability
- **Effective throughput:** ~10 bytes/sec
- **Range:** 5–20 cm, speaker-to-microphone
- **Audibility:** Near-inaudible; most people over 25 cannot hear above 17 kHz

The waveform is a continuous phase FSK sine wave. Each bit is preceded by a 1 ms amplitude ramp to reduce clicking. Frames consist of a 32-bit alternating preamble, a 16-bit sync word (0x3C5A), a 16-bit length field, the payload, and a 16-bit CRC-CCITT checksum.

#### Light Flash (Optical OOK)

- **Colors:** White (#FFFFFF, bit 1) and black (#000000, bit 0)
- **Bit rate:** 10 bps (100 ms per flash)
- **Repeats:** 2 passes per frame
- **Effective throughput:** ~1.2 bytes/sec
- **Range:** Direct line-of-sight, camera-to-screen
- **Safety:** Flash rate stays below the 5 Hz photosensitive epilepsy threshold

The sender shows a full-screen overlay that alternates between white and black. The receiver's camera captures frames and measures average center-region brightness with adaptive thresholding to compensate for auto-exposure.

### Protocol

| Field     | Size       | Description                             |
| --------- | ---------- | --------------------------------------- |
| Preamble  | 32 bits    | Alternating 1/0 for sync detection      |
| Sync word | 16 bits    | 0x3C5A — distinctive frame marker       |
| Length    | 16 bits    | Payload length in bytes (max 65535)     |
| Payload   | N × 8 bits | Encoded data                            |
| CRC-16    | 16 bits    | CCITT checksum over sync+length+payload |

Payload type is determined by the first byte:

- `0x00`: UTF-8 text
- `0x01`: Binary file (2-byte filename length, UTF-8 filename, raw bytes)
- `0x02`: Image (2-byte filename length, UTF-8 filename, image bytes)

## Usage

### Sender

1. Select **Sender** role
2. Choose **Sound Wave** or **Light Flash**
3. Type a message, drop a file, or paste from clipboard
4. Check the estimated transfer time
5. Press **Send** and hold devices close together
6. Wait for completion

### Receiver

1. Select **Receiver** role
2. Choose **Listen via Microphone** (for sound) or **Watch via Camera** (for light)
3. Position the device appropriately
4. Press the start button
5. Wait for data to arrive

## Limitations

- **Low bandwidth:** Designed for short text messages and small files (<64 KB). A 10 KB file takes ~15 minutes via sound, ~2 hours via light.
- **Direct proximity:** Devices must be within 20 cm for reliable transfer.
- **Ambient noise:** Loud environments with ultrasonic noise (e.g., some industrial equipment) may interfere.
- **Lighting:** Very bright ambient light can wash out the screen flashes.
- **Speaker/mic quality:** Budget phone speakers have poor response above 18 kHz.

## Technical Notes

- **Audio modulation:** FSK with 2 tones, generated as AudioBuffer via Web Audio API. Continuous playback looped 3 times with 50 ms gaps between passes.
- **Audio demodulation:** AnalyserNode FFT (2048-point) samples mark/space bins every 5 ms. Preamble detection uses alternating-bit correlation.
- **Visual modulation:** Fixed-position `z-index: 9998` overlay, animated via `requestAnimationFrame` for precise 100 ms timing.
- **Visual demodulation:** Canvas `getImageData` samples center 50% of each frame with adaptive thresholding against recent brightness history.
- **No backend dependency:** All processing happens in-browser with standard Web APIs (Web Audio, Media Capture, Canvas).

## Files

| File                | Purpose                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------- |
| `config.json`       | Tool metadata                                                                           |
| `template.html`     | Wizard UI with role/method selection, data input, progress, and results                 |
| `index.ts`          | Orchestration: navigation, event wiring, data encoding, lifecycle                       |
| `audio-codec.ts`    | `AudioSender` (FSK modulation) and `AudioReceiver` (FFT demodulation)                   |
| `visual-codec.ts`   | `VisualSender` (screen flash overlay) and `VisualReceiver` (camera brightness analysis) |
| `protocol.ts`       | Frame encoding/decoding, CRC-16 CCITT, preamble detection, bit conversion               |
| `transfer-store.ts` | In-memory transfer history with change notifications                                    |
