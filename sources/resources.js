'use strict';

const fs = require('fs');
const path = require('path');

const fse = require('fs-extra');

const { countGalleries, fetchGalleries } = require('../lib/gallery');
const { sequential } = require('../lib/utils');

async function getResources(source) {
	const files = '../../resources';
	return (await sequential(fs.readdirSync(files).map(file => async () => {
		const resource = /^(.+)\.json$/.exec(file)?.[1];
		if (!resource) return [];
		console.log(` + ${resource}`);
		try {
			if (fs.lstatSync(path.join(files, resource)).isDirectory()) {
				console.log('copy', path.join(files, resource), '->', resource);
				fse.removeSync(resource);
				fse.copySync(path.join(files, resource), resource);
			}
		} catch(e) {}
		return await sequential(JSON.parse(fs.readFileSync(path.join(files, file), 'utf-8')).map(game => async () => {
			const links = game.links && await fetchGalleries(game.links);
			console.log(game.game, { gallery: countGalleries(links) });
			return {
				...game,
				...links ? { links } : {},
			};
		}));
	}, []))).flat();
}

exports.getResources = getResources;
