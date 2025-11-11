'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const saveGalleryCache = require('./lib/gallery').saveGalleryCache;
const getResources = require('./sources/resources').getResources;
const fetchUnexotica = require('./sources/unexotica').fetchUnexotica;
const fetchVgmpf = require('./sources/vgmpf').fetchVgmpf;
const fetchWogMods = require('./sources/wog_mods').fetchWogMods;

const DATA = 'data';
const CACHE = '_cache';
const sources = {
	'resources': getResources,
	'VGMPF': fetchVgmpf,
	'World of Game MODs': fetchWogMods,
	'UnExoticA': fetchUnexotica,
};

const PREPEND_LINKS = {
	'Battle Arena Toshinden': [{ title: 'Battle Arena Toshinden', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Battle_Arena_Toshinden' }],
	'Blood': [{ title: 'Blood', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Blood' }],
	'Carmageddon': [{ title: 'Carmageddon', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Carmageddon' }],
	'Descent II': [{ title: 'Descent II', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Descent_II' }],
	'Fatal Racing': [{ title: 'Fatal Racing', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Fatal_Racing' }],
	'Gobliiins': [{ title: 'Gobliiins', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Gobliiins' }],
	'Gobliins 2': [{ title: 'Gobliins 2: The Prince Buffoon', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Gobliins_2:_The_Prince_Buffoon' }],
	'Goblins 3': [{ title: 'Goblins 3', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Goblins_3' }],
	'Hexen: Beyond Heretic': [{ title: 'Hexen: Beyond Heretic', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Hexen:_Beyond_Heretic' }],
	'Hexen II': [{ title: 'Hexen II', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Hexen_II' }],
	'Hexen II: Portal of Praevus': [{ title: 'Hexen II: Portal of Praevus', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Hexen_II:_Portal_of_Praevus' }],
	'Mortal Kombat': [{ title: 'Mortal Kombat', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Mortal_Kombat' }],
	'Screamer': [{ title: 'Screamer', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Screamer' }],
	'Shadow Warrior': [{ title: 'Shadow Warrior', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Shadow_Warrior' }],
	'Super Street Fighter II Turbo': [{ title: 'Super Street Fighter II Turbo', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Super_Street_Fighter_II_Turbo' }],
	'Virtua Cop 2': [{ title: 'Virtua Cop 2', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Virtua_Cop_2' }],
	'Warcraft: Orcs & Humans': [{ title: 'Warcraft: Orcs & Humans', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Warcraft:_Orcs_&_Humans' }],
	'WarCraft II: Tides of Darkness': [{ title: 'Warcraft II: Tides of Darkness', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Warcraft_II:_Tides_of_Darkness' }],
	'Worms': [{ title: 'Worms', site: 'Gamus Pro', url: 'https://pro.gamus.space/PC/Worms' }],
};

const [, , ...updateSources] = process.argv;
updateSources.push('resources');

(async () => {
	try {
		fs.mkdirSync(DATA);
	} catch {}
	try {
		fs.mkdirSync(path.join(DATA, CACHE));
	} catch {}

	const result = [];
	for (const source in sources) {
		const cachePath = path.join(DATA, CACHE, `${source}.json`);
		if (!updateSources.includes(source) && fs.existsSync(cachePath)) {
			result.unshift(JSON.parse(fs.readFileSync(cachePath)));
			continue;
		}

		try {
			fs.mkdirSync(path.join(DATA, source));
		} catch {}
		console.log(`\n   === ${source}\n`);
		process.chdir(path.join(DATA, source));
		const data = await sources[source](source);
		process.chdir(path.join('..', '..'));
		if (data) {
			result.unshift(data);
			fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
		}
	}
	const db = result.flat().sort((g1, g2) => g1.game <= g2.game ? -1 : 1).map(game => ({
		...game,
		links: [...PREPEND_LINKS[game.game] ?? [], ...game.links ?? []],
	}));
	fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify(db, null, 2));
	const songs = db.map(({ songs }) => songs.length).reduce((sum, count) => sum+count, 0);
	console.log(`\n   === total\n\ngames: ${db.length}\nsongs: ${songs}`);
	saveGalleryCache();
})();
