'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');

if (process.argv.length < 3) {
	console.error(`usage: ${process.argv[1]} dir (...)`);
	process.exit(1);
}

const dirs = process.argv.slice(2);
dirs.forEach(dir => {
	fs.readdirSync(dir).forEach(file => {
		const src = path.join(dir, file);
		const dst = src.toLowerCase();
		console.log('mv', src, dst);
		fs.renameSync(src, dst);
	});
});
