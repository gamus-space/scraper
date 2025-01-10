'use strict';

const path = require('path');

Object.assign(exports, { splitSongDI, splitSongDW, splitSongMOD, splitSongRJP, splitSongRH, splitSongST3, splitSongTFMX });

function splitSongTFMX(song, file) {
	const entry = file.getEntry(path.basename(song.song));
	const data = entry.getData();
	if (!["TFMX-SONG ", "tfmxsong\0\0", "TFMX \0\0\x01\0\0"].includes(String.fromCharCode.apply(null, data.slice(0, 10))))
		return [];
	data.swap16();
	const data16 = new Uint16Array(data.buffer, data.byteOffset, data.length / 2);

	const songStart = data16.slice(128, 128 + 32);
	const songEnd = data16.slice(128 + 32, 128 + 64);
	const songRanges = Array.from(songStart).map((start, i) => {
		const end = songEnd[i];
		if (songStart.slice(0, i).includes(start) && songEnd.slice(0, i).includes(end))
			return [null, null];
		if ((start === 0 && end === 0) || (start === 511 && end === 511))
			return [null, null];
		return [start, end];
	});
	const subsongs = songRanges.map(([start, end], i) => {
		return (start === null && end === null) ? null : i;
	}).filter(i => i != null);
	return subsongs;
}

function splitSongMOD(song, data, options = {}) {
	//console.log('*', song.song, data.length);
	if (String.fromCharCode.apply(null, data.slice(952, 956)) === "KRIS")
		return chiptracker(data, options);
	else
		return soundtracker(data, options);
}

function soundtracker(data, options) {
	let samples = 31;
	let channels = 4;
	let signature = String.fromCharCode.apply(null, data.slice(1080, 1084));
	switch (signature) {
	case "M.K.":
	case "M!K!":
	case "4CHN":
	case "FLT4":
		break;
	case "6CHN":
		channels = 6;
		break;
	case "8CHN":
	case "FLT8":
		channels = 8;
		break;
	case "28CH":
		channels = 28;
		break;
	default:
		signature = "";
		samples = 15;
	}
	//console.log(signature || 'orig', { samples, channels });

	let p = 20 + 30*samples + 0;
	const length = data[p++];
	const repeat = data[p] === 0x7f ? 0 : data[p];
	p++;
	const trackIndex = new Uint8Array(128);
	let patterns = 0;
	for (let i = 0; i < trackIndex.length; i++, p++) {
		trackIndex[i] = data[p];
		patterns = Math.max(patterns, trackIndex[i]);
	}
	patterns++;
	p += samples === 15 ? 0 : 4;
	const patternData = data.slice(p, p + patterns*64*channels*4);
	return scan({ channels, length, trackIndex, patternData, ...options }, (track, row, chan) => {
		const pattern = ((trackIndex[track] * 64 + row) * channels + chan) * 4;
		return patternData.slice(pattern, pattern+4);
	});
}

function chiptracker(data, options) {
	//console.log('KRIS');
	const samples = 31;
	const channels = 4;
	let p = 22 + 30*samples + 4;
	const length = data[p++];
	const repeat = data[p++];
	const trackIndex = new Uint8Array(128 * channels);
	let patterns = 0;
	for (let i = 0; i < trackIndex.length; i++, p+=2) {
		trackIndex[i] = data[p];
		patterns = Math.max(patterns, trackIndex[i]);
	}
	patterns++;
	p += 2;
	const patternData = data.slice(p, p + patterns*64*4);
	return scan({ channels, length, trackIndex, patternData, ...options }, (track, row, chan) => {
		const pattern = (trackIndex[track*channels+chan] * 64 + row) * 4;
		return patternData.slice(pattern, pattern+4);
	});
}

function scan({ channels, length, trackIndex, patternData, minTrackLength }, play) {
	const songs = [];
	const played = new Array(length);
	while (true) {
		const firstTrack = played.findIndex(p => !p);
		if (firstTrack < 0)
			break;
		let state = { track: firstTrack, row: 0, tracksPlayed: 0 };
		do {
			state = advance(state, channels, length, played, play);
		} while (!state.finished);
		if (state.tracksPlayed >= (minTrackLength || 1))
			songs.push(firstTrack);
	}
	return songs;
}

function advance({ track, row, jump, tracksPlayed }, channels, length, played, play) {
	if (jump && played[track])
		return { finished: true, tracksPlayed };
	played[track] = true;
	for (let chan = 0; chan < channels; chan++) {
		const note = play(track, row, chan);
		//console.log('play', chan, note);
		switch (note[2] & 0xf) {
		case 0xb:
			if (note[3] >= length)
				return { finished: true, tracksPlayed: tracksPlayed+1 };
			return { track: note[3], row: 0, jump: true, tracksPlayed: tracksPlayed+1 };
		case 0xd:
			return { track: track+1, row: ((note[3]&0xf0)>>4)*10 + (note[3]&0xf), jump: true, tracksPlayed: tracksPlayed+1 };
		}
	};
	if (row < 63)
		return { track, row: row+1, tracksPlayed };
	return track < length-1 ?
		{ track: track+1, row: 0, jump: true, tracksPlayed: tracksPlayed+1 } :
		{ finished: true, tracksPlayed: tracksPlayed+1 };
}

function splitSongDI(song, data) {
	let p = 0;
	if (data[p++] !== 0) return [];
	const samples = data[p++];
	if (samples === 0 || samples > 31) return [];
	const tracksPtr = ulong(data, p);
	const patternsPtr = ulong(data, p+4);
	const samplesPtr = ulong(data, p+8);
	p += 12;
	if (tracksPtr >= patternsPtr || patternsPtr >= samplesPtr) return [];
	if (samplesPtr >= data.length) return [];
	if (data[patternsPtr-1] != 0xff) return [];
	p = tracksPtr;
	const tracks = [];
	while (p < data.length) {
		if (data[p] === 0xff) break;
		tracks.push(data[p++]);
	}
	const patterns = Math.max(...tracks) + 1;
	//console.log(tracks, patterns);
	const offsets = new Array(patterns+1);
	p = 14 + samples*8;
	for (let i = 0; i < patterns; i++) {
		offsets[i] = ushort(data, p);
		p += 2;
	}
	offsets[patterns] = samplesPtr;

	const unpacked = new Uint8Array(1084 + patterns << 10);
	const signature = "M.K.";
	const maxSamples = 31;
	let q = 20 + 30 * maxSamples;
	unpacked[q++] = tracks.length;
	unpacked[q++] = 0x7f;
	for (let i = 0; i < tracks.length; i++) {
		unpacked[q++] = tracks[i];
	}
	q = 1080;
	for (let i = 0; i < signature.length; i++) {
		unpacked[q++] = signature.charCodeAt(i);
	}

	p = patternsPtr;
	for (let i = 1; i <= patterns; i++) {
		const limit = offsets[i];
		do {
			const b0 = data[p++];
			if (b0 === 0xff) {
				q += 4;
				continue;
			}
			const b1 = data[p++];
			const b2 = ((b0 << 4) & 0x30) | ((b1 >> 4) & 0x0f);
			const b3 =  (b0 >> 2) & 0x1f;
			const note = [0, 0];
			unpacked[q++] = note[0] | (b3 & 0xf0);
			unpacked[q++] = note[1];
			unpacked[q++] = ((b3 << 4) & 0xf0) | (b1 & 0x0f);
			if (b0 & 0x80) {
				unpacked[q++] = data[p++];
			} else {
				q++;
			}
		} while (p < limit);
		q = 1084 + (i << 10);
	}
	return splitSongMOD(song, unpacked, { minTrackLength: 2 });
}

function splitSongRH(song, data) {
	if (data.length < 1024) return;
	let p;
	let headerPtr;
	for (p = 44; p < 1024; p++) {
		if (ushort(data, p) === 0xc0fc && ushort(data, p+4) === 0x41eb) {
			headerPtr = ushort(data, p+6);
			p += 8;
		}
	}
	if (!headerPtr) return [];

	p = headerPtr;
	let value = 0x10000;
	let songs = [];
	do {
		p += 2;
		for (let i = 0; i < 4; i++) {
			let val = ulong(data, p);
			p += 4;
			if (val < value) value = val;
		}
		songs.push(songs.length);
	} while(value - p >= 18);
	return songs;
}

function splitSongDW(song, data) {
	let p = 0;
	if (ushort(data, p) === 0x48e7) {
		p += 4;
		if (ushort(data, p) !== 0x6100) return;
		p += 2;
		p += ushort(data, p);
	}

	let headerPtr, base = 0, rlen = 2, size = 10;
	for (; p < 1024; p++) {
		if (ushort(data, p) === 0x47fa) {
			base = p+2 + sshort(data, p+2);
			p += 4;
		}
		if (ushort(data, p) === 0xc0fc && ushort(data, p+4) === 0x41fa) {
			headerPtr = p+6 + ushort(data, p+6);
			p += 8;
		}
		if (ushort(data, p) === 0x1230 && ushort(data, p-4) === 0x41fa) {
			headerPtr = p-2 + ushort(data, p-2);
			p += 2;
		}
		if (ushort(data, p) === 0x4e75) {
			break;
		}
	}
	if (!headerPtr) return [];

	p = headerPtr;
	let value = 0x7fffffff;
	let songs = [];
	do {
		p += 2;
		for (let i = 0; i < 4; i++) {
			let val = base;
			if (rlen === 4)
				val += ulong(data, p);
			if (rlen === 2)
				val += ushort(data, p);
			p += rlen;
			if (val < value) value = val;
		}
		songs.push(songs.length);
	} while(value - p >= size);
	return songs;
}

function splitSongST3(song, data) {
	if (String.fromCharCode.apply(null, data.slice(44, 48)) !== "SCRM")
		return [];
	const length = ushort_le(data, 32);
	const orders = data.slice(96, 96+length);
	return [0, ...Array.from(orders)
		.map((order, i) => order >= 254 ? i+1 : null)
		.filter(s => s != null)
		.filter((order, i, orders) => orders[i+1] !== order+1 && orders[i+1] != null)
	];
}

function splitSongRJP(song, data) {
	if (!String.fromCharCode.apply(null, data.slice(0, 8)).match(/^RJP[1230]SMOD$/))
		return [];
	let p = 8;
	p += ulong(data, p) + 4;
	p += ulong(data, p) + 4;
	const tracksPos = p;
	p += ulong(data, p) + 4;
	const pointers = ulong(data, p) >> 2;
	p = tracksPos;
	const tracks = ulong(data, p) >> 2;
	p += 4;
	let songs = [];
	for (let i = 0; i < tracks; i++) {
		const ptrs = [0, 1, 2, 3].map(offset => data[p+offset]);
		if (ptrs.some(ptr => ptr > 0 && ptr < pointers))
			songs.push(songs.length);
		p += 4;
	}
	return songs;
}

function ushort(array, start) {
	return (array[start] << 8) | array[start+1];
}

function sshort(array, start) {
	return new Int16Array([ushort(array, start)])[0];
}

function ulong(array, start) {
	return (array[start] << 24) | (array[start+1] << 16) | (array[start+2] << 8) | array[start+3];
}

function ushort_le(array, start) {
	return array[start] | (array[start+1] << 8);
}
