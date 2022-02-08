'use strict';

const fs = require('fs');
const process = require('process');
const fetchUnexotica = require('./unexotica').fetchUnexotica;
const fetchWogMods = require('./wog_mods').fetchWogMods;

const DATA = 'data';
const sources = {
	'World of Game MODs': fetchWogMods,
	'UnExoticA': fetchUnexotica,
};

(async () => {
	try {
		fs.mkdirSync(DATA);
	} catch {}

	const result = [];
	for (const source in sources) {
		try {
			fs.mkdirSync(`${DATA}/${source}`);
		} catch {}
		process.chdir(`${DATA}/${source}`);
		result.unshift(await sources[source](source));
		process.chdir('../..');
	}
	const db = result.flat().sort((g1, g2) => g1.game <= g2.game ? -1 : 1);
	fs.writeFileSync(`${DATA}/index.json`, JSON.stringify(db, null, 2));
})();
