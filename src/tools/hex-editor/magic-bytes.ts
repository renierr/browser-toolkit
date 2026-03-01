/**
 * Common magic bytes for file identification
 * Format: { name, type, bytes, offset? }
 * null in bytes array acts as a wildcard (match anything).
 */
export const MAGIC_BYTES = [
  // Images
  { name: 'JPEG Image', type: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  { name: 'PNG Image', type: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  { name: 'GIF Image', type: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'WebP Image', type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
  { name: 'BMP Image', type: 'image/bmp', bytes: [0x42, 0x4D] },
  { name: 'ICO Icon', type: 'image/x-icon', bytes: [0x00, 0x00, 0x01, 0x00] },
  { name: 'TIFF Image (LE)', type: 'image/tiff', bytes: [0x49, 0x49, 0x2A, 0x00] },
  { name: 'TIFF Image (BE)', type: 'image/tiff', bytes: [0x4D, 0x4D, 0x00, 0x2A] },
  { name: 'PSD Document', type: 'image/vnd.adobe.photoshop', bytes: [0x38, 0x42, 0x50, 0x53] },
  { name: 'HEIC Image', type: 'image/heic', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63] },
  { name: 'AVIF Image', type: 'image/avif', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66] },
  { name: 'SVG Image', type: 'image/svg+xml', bytes: [0x3C, 0x73, 0x76, 0x67] },
  { name: 'JPEG 2000', type: 'image/jp2', bytes: [0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20] },
  { name: 'BPG Image', type: 'image/bpg', bytes: [0x42, 0x50, 0x47, 0xFB] },
  { name: 'FLIF Image', type: 'image/flif', bytes: [0x46, 0x4C, 0x49, 0x46] },
  { name: 'OpenEXR Image', type: 'image/x-exr', bytes: [0x76, 0x2F, 0x31, 0x01] },
  { name: 'TGA Image', type: 'image/x-tga', bytes: [0x00, 0x00, 0x02, 0x00, 0x00] },
  { name: 'PCX Image', type: 'image/x-pcx', bytes: [0x0A, 0x05, 0x01, 0x08] },

  // Documents
  { name: 'PDF Document', type: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2D] },
  { name: 'RTF Document', type: 'application/rtf', bytes: [0x7B, 0x5C, 0x72, 0x74, 0x66, 0x31] },
  { name: 'PostScript', type: 'application/postscript', bytes: [0x25, 0x21, 0x50, 0x53] },
  { name: 'EPUB', type: 'application/epub+zip', bytes: [0x50, 0x4B, 0x03, 0x04, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0x6D, 0x69, 0x6D, 0x65, 0x74, 0x79, 0x70, 0x65, 0x61, 0x70, 0x70, 0x6C, 0x69, 0x63, 0x61, 0x74, 0x69, 0x6F, 0x6E, 0x2F, 0x65, 0x70, 0x75, 0x62, 0x2B, 0x7A, 0x69, 0x70] },
  { name: 'MS Word (Legacy)', type: 'application/msword', bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] },
  { name: 'MS Excel (Legacy)', type: 'application/vnd.ms-excel', bytes: [0x09, 0x08, 0x10, 0x00, 0x00, 0x06, 0x05, 0x00] },
  { name: 'InDesign Doc', type: 'application/x-indesign', bytes: [0x06, 0x06, 0xED, 0xF5, 0xD8, 0x1D, 0x46, 0xE5, 0xBD, 0x31, 0xEF, 0xE7, 0xFE, 0x74, 0xB7, 0x1D] },

  // Archives / Compressed
  { name: 'ZIP Archive', type: 'application/zip', bytes: [0x50, 0x4B, 0x03, 0x04] },
  { name: 'RAR Archive', type: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x00] },
  { name: 'RAR Archive (v5)', type: 'application/x-rar-compressed', bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01] },
  { name: '7z Archive', type: 'application/x-7z-compressed', bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: 'GZIP Compressed', type: 'application/gzip', bytes: [0x1F, 0x8B] },
  { name: 'BZIP2 Compressed', type: 'application/x-bzip2', bytes: [0x42, 0x5A, 0x68] },
  { name: 'XZ Compressed', type: 'application/x-xz', bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00] },
  { name: 'LZMA Compressed', type: 'application/x-lzma', bytes: [0x5D, 0x00, 0x00, 0x80, 0x00] },
  { name: 'LZH Compressed', type: 'application/x-lzh-compressed', bytes: [null, null, null, 0x2D, 0x6C, 0x68] },
  { name: 'CAB Archive', type: 'application/vnd.ms-cab-compressed', bytes: [0x4D, 0x53, 0x43, 0x46] },
  { name: 'Tar Archive', type: 'application/x-tar', bytes: [0x75, 0x73, 0x74, 0x61, 0x72], offset: 257 },
  { name: 'ISO CD Image', type: 'application/x-iso9660-image', bytes: [0x43, 0x44, 0x30, 0x30, 0x31], offset: 32769 },
  { name: 'LZ4 Compressed', type: 'application/x-lz4', bytes: [0x04, 0x22, 0x4D, 0x18] },
  { name: 'Zstd Compressed', type: 'application/zstd', bytes: [0x28, 0xB5, 0x2F, 0xFD] },
  { name: 'Z Compressed', type: 'application/x-compress', bytes: [0x1F, 0x9D] },
  { name: 'CPIO Archive', type: 'application/x-cpio', bytes: [0x30, 0x37, 0x30, 0x37, 0x30, 0x31] },
  { name: 'Zlib Compressed', type: 'application/zlib', bytes: [0x78, 0x01] },
  { name: 'Zlib Compressed (Default)', type: 'application/zlib', bytes: [0x78, 0x9C] },
  { name: 'Zlib Compressed (Best)', type: 'application/zlib', bytes: [0x78, 0xDA] },

  // Executables / System
  { name: 'EXE / DLL', type: 'application/x-msdownload', bytes: [0x4D, 0x5A] },
  { name: 'ELF Executable', type: 'application/x-elf', bytes: [0x7F, 0x45, 0x4C, 0x46] },
  { name: 'Java Class', type: 'application/java-vm', bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
  { name: 'Mach-O (32-bit)', type: 'application/x-mach-binary', bytes: [0xFE, 0xED, 0xFA, 0xCE] },
  { name: 'Mach-O (64-bit)', type: 'application/x-mach-binary', bytes: [0xFE, 0xED, 0xFA, 0xCF] },
  { name: 'WASM Binary', type: 'application/wasm', bytes: [0x00, 0x61, 0x73, 0x6D] },
  { name: 'Dalvik Executable', type: 'application/vnd.android.dex', bytes: [0x64, 0x65, 0x78, 0x0A] },
  { name: 'Debian Package', type: 'application/vnd.debian.binary-package', bytes: [0x21, 0x3C, 0x61, 0x72, 0x63, 0x68, 0x3E] },
  { name: 'RPM Package', type: 'application/x-rpm', bytes: [0xED, 0xAB, 0xEE, 0xDB] },
  { name: 'Windows Shortcut', type: 'application/x-ms-shortcut', bytes: [0x4C, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00] },
  { name: 'Apple Disk Image', type: 'application/x-apple-diskimage', bytes: [0x6B, 0x6F, 0x6C, 0x79], offset: 0 },
  { name: 'LNK Shortcut', type: 'application/x-ms-shortcut', bytes: [0x4C, 0x00, 0x00, 0x00] },
  { name: 'Windows Dump', type: 'application/x-dmp', bytes: [0x4D, 0x44, 0x4D, 0x50, 0x93, 0xA7] },
  { name: 'COFF Object', type: 'application/x-coff', bytes: [0x4C, 0x01] },

  // ROMs / Emulation
  { name: 'NES ROM', type: 'application/x-nintendo-nes-rom', bytes: [0x4E, 0x45, 0x53, 0x1A] },
  { name: 'GameBoy ROM', type: 'application/x-gameboy-rom', bytes: [0x00, 0xC3], offset: 0 },
  { name: 'Sega Genesis ROM', type: 'application/x-genesis-rom', bytes: [0x53, 0x45, 0x47, 0x41], offset: 256 },
  { name: 'N64 ROM (BE)', type: 'application/x-n64-rom', bytes: [0x80, 0x37, 0x12, 0x40] },
  { name: 'N64 ROM (LE)', type: 'application/x-n64-rom', bytes: [0x40, 0x12, 0x37, 0x80] },
  { name: 'Dreamcast ROM', type: 'application/x-dreamcast-rom', bytes: [0x53, 0x45, 0x47, 0x41, 0x20, 0x53, 0x45, 0x47, 0x41, 0x44, 0x45, 0x4E, 0x4B, 0x55] },
  { name: 'PS2 Executable', type: 'application/x-ps2-exe', bytes: [0x7F, 0x45, 0x4C, 0x46, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x08, 0x00] },
  { name: 'PSX Executable', type: 'application/x-psx-exe', bytes: [0x50, 0x53, 0x2D, 0x58, 0x20, 0x45, 0x58, 0x45] },
  { name: 'GBA ROM', type: 'application/x-gba-rom', bytes: [0x24, 0xFF, 0xAE, 0x51, 0x69, 0x9A, 0xA2, 0x21], offset: 4 },
  { name: 'GC/Wii Image', type: 'application/x-gamecube-rom', bytes: [0xC2, 0x33, 0x9F, 0x3D], offset: 28 },

  // Media
  { name: 'MP4 Video', type: 'video/mp4', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32] },
  { name: 'MP4 Video (QuickTime)', type: 'video/quicktime', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20] },
  { name: 'MOV Video', type: 'video/quicktime', bytes: [null, null, null, null, 0x6d, 0x6f, 0x6f, 0x76] },
  { name: 'AVI Video', type: 'video/x-msvideo', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x41, 0x56, 0x20, 0x41, 0x56, 0x49] },
  { name: 'MKV Video', type: 'video/x-matroska', bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  { name: 'FLV Video', type: 'video/x-flv', bytes: [0x46, 0x4C, 0x56, 0x01] },
  { name: 'MP3 Audio (ID3)', type: 'audio/mpeg', bytes: [0x49, 0x44, 0x33] },
  { name: 'MP3 Audio (Heading)', type: 'audio/mpeg', bytes: [0xFF, 0xFB] },
  { name: 'WAV Audio', type: 'audio/wav', bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x41, 0x56, 0x45] },
  { name: 'Ogg Media', type: 'application/ogg', bytes: [0x4F, 0x67, 0x67, 0x53] },
  { name: 'FLAC Audio', type: 'audio/x-flac', bytes: [0x66, 0x4C, 0x61, 0x43] },
  { name: 'MIDI Audio', type: 'audio/midi', bytes: [0x4D, 0x54, 0x68, 0x64] },
  { name: 'AAC Audio', type: 'audio/aac', bytes: [0xFF, 0xF1] },
  { name: 'WMA Audio', type: 'audio/x-ms-wma', bytes: [0x30, 0x26, 0xB2, 0x75, 0x8E, 0x66, 0xCF, 0x11, 0xA6, 0xD9, 0x00, 0xAA, 0x00, 0x62, 0xCE, 0x6C] },
  { name: 'AIFF Audio', type: 'audio/x-aiff', bytes: [0x46, 0x4F, 0x52, 0x4D, null, null, null, null, 0x41, 0x49, 0x46, 0x46] },
  { name: 'AU Audio', type: 'audio/basic', bytes: [0x2E, 0x73, 0x6E, 0x64] },
  { name: 'AC3 Audio', type: 'audio/ac3', bytes: [0x0B, 0x77] },
  { name: 'M4A Audio', type: 'audio/mp4', bytes: [null, null, null, null, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20] },
  { name: 'SWF Flash', type: 'application/x-shockwave-flash', bytes: [0x46, 0x57, 0x53] },
  { name: 'CWS Flash', type: 'application/x-shockwave-flash', bytes: [0x43, 0x57, 0x53] },

  // Forensics / Security
  { name: 'Pcap Network Trace', type: 'application/vnd.tcpdump.pcap', bytes: [0xD4, 0xC3, 0xB2, 0xA1] },
  { name: 'Pcap Network Trace (BE)', type: 'application/vnd.tcpdump.pcap', bytes: [0xA1, 0xB2, 0xC3, 0xD4] },
  { name: 'Pcapng Trace', type: 'application/x-pcapng', bytes: [0x0A, 0x0D, 0x0D, 0x0A] },
  { name: 'DICOM Medical Image', type: 'application/dicom', bytes: [0x44, 0x49, 0x43, 0x4D], offset: 128 },
  { name: 'SQLite WAL', type: 'application/x-sqlite3-wal', bytes: [0x37, 0x7F, 0x06, 0x82] },
  { name: 'EWF Evidence (EnCase)', type: 'application/x-encase-evidence', bytes: [0x45, 0x56, 0x46, 0x09, 0x0D, 0x0A, 0xFF, 0x00] },

  // Databases / Data
  { name: 'SQLite DB', type: 'application/vnd.sqlite3', bytes: [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00] },
  { name: 'XML file', type: 'application/xml', bytes: [0x3C, 0x3F, 0x78, 0x6D, 0x6C] },
  { name: 'JSON file', type: 'application/json', bytes: [0x7B, 0x22] },
  { name: 'Lua Bytecode', type: 'application/x-lua-bytecode', bytes: [0x1B, 0x4C, 0x75, 0x61] },
  { name: 'Compiled Python', type: 'application/x-python-code', bytes: [0x03, 0xF3, 0x0D, 0x0A] },
  { name: 'DS_Store', type: 'application/octet-stream', bytes: [0x00, 0x00, 0x00, 0x01, 0x42, 0x75, 0x64, 0x31] },
  { name: 'PEM Keys', type: 'application/x-pem-file', bytes: [0x2D, 0x2D, 0x2D, 0x2D, 0x2D, 0x42, 0x45, 0x47, 0x49, 0x4E] },
  { name: 'DER Certificate', type: 'application/x-x509-ca-cert', bytes: [0x30, 0x82] },
  { name: 'PGP Private Key', type: 'application/pgp-keys', bytes: [0x95, 0x01] },
  { name: 'Torrent File', type: 'application/x-bittorrent', bytes: [0x64, 0x38, 0x3A, 0x61, 0x6E, 0x6E, 0x6F, 0x75, 0x6E, 0x63, 0x65] },
  { name: 'Windows Registry', type: 'application/x-ms-registry', bytes: [0x57, 0x69, 0x6E, 0x64, 0x6F, 0x77, 0x73, 0x20, 0x52, 0x65, 0x67, 0x69, 0x73, 0x74, 0x72, 0x79] },
  { name: 'Bencode Object', type: 'application/x-bencode', bytes: [0x64, 0x31, 0x3A] },

  // Niche / Other
  { name: 'VHD Disk Image', type: 'application/x-vhd', bytes: [0x63, 0x6F, 0x6E, 0x65, 0x63, 0x74, 0x69, 0x78], offset: 511 },
  { name: 'VMDK Disk Image', type: 'application/x-vmdk', bytes: [0x4B, 0x44, 0x4D, 0x56] },
  { name: 'Blender Project', type: 'application/x-blender', bytes: [0x42, 0x4C, 0x45, 0x4E, 0x44, 0x45, 0x52] },
  { name: 'Photoshop Pattern', type: 'application/x-photoshop-pattern', bytes: [0x38, 0x42, 0x50, 0x54] },
  { name: 'Unity Asset', type: 'application/x-unity-asset', bytes: [0x55, 0x6E, 0x69, 0x74, 0x79, 0x57, 0x65, 0x62] },
  { name: 'WORDPRESS Export', type: 'application/rss+xml', bytes: [0x3C, 0x72, 0x73, 0x73, 0x20, 0x76, 0x65, 0x72, 0x73, 0x69, 0x6F, 0x6E, 0x3D] },
  { name: 'PST Mailbox', type: 'application/vnd.ms-outlook', bytes: [0x21, 0x42, 0x44, 0x4E] },
  { name: 'EDB Database', type: 'application/vnd.ms-exchange-edb', bytes: [0xEF, 0xCD, 0xAB, 0x89], offset: 4 },
  { name: 'Windows Dump', type: 'application/x-dmp', bytes: [0x4D, 0x44, 0x4D, 0x50, 0x93, 0xA7] },
];

/**
 * Identifies a file type based on its leading bytes.
 */
export function identifyFileType(buffer: Uint8Array): { name: string; type: string } | null {
  // 1. Binary checks (Magic Bytes)
  for (const entry of MAGIC_BYTES) {
    const offset = entry.offset || 0;
    const requiredLength = offset + entry.bytes.length;
    if (buffer.length < requiredLength) continue;

    let match = true;
    for (let i = 0; i < entry.bytes.length; i++) {
      const expected = entry.bytes[i];
      if (expected !== null && buffer[offset + i] !== expected) {
        match = false;
        break;
      }
    }
    if (match) return { name: entry.name, type: entry.type };
  }

  // 2. Binary vs Text heuristic
  let nulls = 0;
  const scanLimit = Math.min(buffer.length, 2048);
  for (let i = 0; i < scanLimit; i++) if (buffer[i] === 0) nulls++;

  if (nulls === 0 && buffer.length > 0) {
    // 3. Advanced Text Identification
    const head = new TextDecoder().decode(buffer.slice(0, 4096));
    const lowerHead = head.toLowerCase();

    // Web / Frontend
    if (lowerHead.includes('<!doctype html') || lowerHead.includes('<html')) return { name: 'HTML Document', type: 'text/html' };
    if (lowerHead.includes('<svg') && lowerHead.includes('xmlns=')) return { name: 'SVG Image', type: 'image/svg+xml' };
    if (head.includes('<?php')) return { name: 'PHP Script', type: 'application/x-php' };
    if (head.includes('body {') || head.includes('.cls {') || head.includes('@import') || head.includes('@media ')) return { name: 'CSS Stylesheet', type: 'text/css' };

    // Scripts & Source
    if (head.startsWith('#!/bin/bash') || head.startsWith('#!/bin/sh')) return { name: 'Shell Script', type: 'application/x-sh' };
    if (head.startsWith('#!/usr/bin/env pwsh') || head.startsWith('#!/usr/bin/env powershell') || head.includes('Write-Host ') || head.includes('$global:')) return { name: 'PowerShell Script', type: 'application/x-powershell' };
    if (head.startsWith('#!/usr/bin/env python') || head.includes('import os\n') || head.includes('def main():')) return { name: 'Python Script', type: 'text/x-python' };
    if (head.startsWith('#!/usr/bin/env node') || head.includes('import ') || head.includes('require(')) return { name: 'JavaScript / Node', type: 'application/javascript' };
    if (head.includes('public class ') && head.includes('static void main')) return { name: 'Java Source', type: 'text/x-java' };
    if (head.includes('#include <') && (head.includes('int main') || head.includes('void main'))) return { name: 'C/C++ Source', type: 'text/x-c' };
    if (head.startsWith('FROM ') && head.includes('RUN ')) return { name: 'Dockerfile', type: 'text/x-dockerfile' };
    if (head.includes('\t') && head.includes(':') && (head.includes('.PHONY') || head.includes('all:'))) return { name: 'Makefile', type: 'text/x-makefile' };
    if (head.includes('package main') && head.includes('func main()')) return { name: 'Go Source', type: 'text/x-go' };
    if (head.includes('fn main()') && head.includes('use std::')) return { name: 'Rust Source', type: 'text/x-rust' };
    if (head.includes('require "rspec"') || head.includes('def initialize')) return { name: 'Ruby Script', type: 'text/x-ruby' };
    if (head.includes('using System;') || head.includes('namespace ') && head.includes('class ')) return { name: 'C# Source', type: 'text/x-csharp' };
    if (head.includes('import kotlin.') || head.includes('fun main(')) return { name: 'Kotlin Source', type: 'text/x-kotlin' };
    if (head.includes('import Swift') || head.includes('func ') && head.includes('-> ')) return { name: 'Swift Source', type: 'text/x-swift' };

    // Data / Config formats
    if (head.startsWith('---') && (head.includes('\n- ') || head.includes(': '))) return { name: 'YAML/Frontmatter', type: 'text/yaml' };
    if (head.startsWith('BEGIN:VCARD')) return { name: 'vCard Contact', type: 'text/vcard' };
    if (head.startsWith('BEGIN:VCALENDAR')) return { name: 'iCalendar Event', type: 'text/calendar' };
    if (head.includes('<?xml')) return { name: 'XML Document', type: 'application/xml' };
    if (head.includes('# ') && head.includes('\n## ')) return { name: 'Markdown Document', type: 'text/markdown' };
    if (head.includes('[Section]') || head.includes('[Config]') || (head.includes('=') && head.includes('\n['))) return { name: 'INI / Config', type: 'text/x-ini' };
    if (head.includes('DEBUG: ') || head.includes('INFO: ') || head.includes('ERROR: ') || head.includes('FATAL: ')) return { name: 'Log File', type: 'text/x-log' };
    if (head.includes('DB_HOST=') || head.includes('API_KEY=') || head.includes('PORT=')) return { name: 'Environment File', type: 'text/plain' };

    return { name: 'Plain Text', type: 'text/plain' };
  }

  return null;
}
