'use strict';

const fs = require('fs');
const process = require('process');
const fetchUnexotica = require('./unexotica').fetchUnexotica;

const DATA = 'data';
const sources = {
	'UnExoticA': fetchUnexotica,
};

(async () => {
	const dir = process.cwd();
	try {
		fs.mkdirSync(DATA);
	} catch {}

	const result = [];
	for (const source in sources) {
		try {
			fs.mkdirSync(`${DATA}/${source}`);
		} catch {}
		process.chdir(`${DATA}/${source}`);
		result.unshift(await fetchUnexotica());
	}

	process.chdir(dir);
	fs.writeFileSync(`${DATA}/index.json`, JSON.stringify(result.flat(), null, 2));
})();
