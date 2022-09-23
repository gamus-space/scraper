'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

if (process.argv.length < 3) {
	console.error(`usage: ${process.argv[1]} dir (...)`);
	process.exit(1);
}

const dirs = process.argv.slice(2);
console.log(JSON.stringify(dirs.map(dir => ({
	game: "",
	platform: "",
	developers: [],
	publishers: [],
	year: 0,
	source: "",
	songs: fs.readdirSync(dir).map(file => ({
		song: file,
		song_link: path.join(dir, file).replace(/\\/g, '/'),
		size: fs.statSync(path.join(dir, file)).size,
		composer: "",
	})),
})), null, 2));
