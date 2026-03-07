const fs = require('fs');

const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

const { countGalleries, fetchGalleries } = require('../lib/gallery');
const { groupBy, indexBy, sequenceUntil, sequential } = require('../lib/utils');

const LINKS_FLAT = [
    { title: 'All New World Of Lemmings', site: 'MobyGames', url: 'https://www.mobygames.com/game/1752/the-lemmings-chronicles/', gallerySection: 'DOS screenshots' },
    { title: 'Alone in the Dark', site: 'MobyGames', url: 'https://www.mobygames.com/game/325/alone-in-the-dark/', gallerySection: 'DOS screenshots' },
    { title: 'Alone in the Dark 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/907/alone-in-the-dark-2/', gallerySection: 'DOS screenshots' },
    { title: 'Arkanoid II: Revenge of DOH', site: 'MobyGames', url: 'https://www.mobygames.com/game/1088/arkanoid-revenge-of-doh/', gallerySection: 'DOS screenshots' },
    { title: 'BC Racers', site: 'MobyGames', url: 'https://www.mobygames.com/game/5566/bc-racers/', gallerySection: 'DOS screenshots' },
    { title: 'Body Blows', site: 'MobyGames', url: 'https://www.mobygames.com/game/1970/body-blows/', gallerySection: 'DOS screenshots' },
    { title: 'Bubble Bobble', site: 'MobyGames', url: 'https://www.mobygames.com/game/787/bubble-bobble/', gallerySection: 'DOS screenshots' },
    { title: 'Budokan', site: 'MobyGames', url: 'https://www.mobygames.com/game/588/budokan-the-martial-spirit/', gallerySection: 'DOS screenshots' },
    { title: 'Castlevania', site: 'MobyGames', url: 'https://www.mobygames.com/game/2062/castlevania/', gallerySection: 'DOS screenshots' },
    { title: 'Cool Spot', site: 'MobyGames', url: 'https://www.mobygames.com/game/682/cool-spot/', gallerySection: 'DOS screenshots' },
    { title: 'Curse of Enchantia', site: 'MobyGames', url: 'https://www.mobygames.com/game/2409/curse-of-enchantia/', gallerySection: 'DOS screenshots' },
    { title: 'Dark Seed', site: 'MobyGames', url: 'https://www.mobygames.com/game/302/dark-seed/', gallerySection: 'DOS screenshots' },
    { title: 'Dyna Blaster', site: 'MobyGames', url: 'https://www.mobygames.com/game/5143/bomberman/', gallerySection: 'DOS screenshots' },
    { title: 'Elvira', site: 'MobyGames', url: 'https://www.mobygames.com/game/4050/elvira/', gallerySection: 'DOS screenshots' },
    { title: 'Elvira II', site: 'MobyGames', url: 'https://www.mobygames.com/game/1779/elvira-ii-the-jaws-of-cerberus/', gallerySection: 'DOS screenshots' },
    { title: 'Flashback', site: 'MobyGames', url: 'https://www.mobygames.com/game/555/flashback-the-quest-for-identity/', gallerySection: 'DOS screenshots' },
    { title: 'Fury of the Furries', site: 'MobyGames', url: 'https://www.mobygames.com/game/1137/pac-in-time/', gallerySection: 'DOS screenshots' },
    { title: 'Golden Axe', site: 'MobyGames', url: 'https://www.mobygames.com/game/199/golden-axe/', gallerySection: 'DOS screenshots' },
    { title: 'Hired Guns', site: 'MobyGames', url: 'https://www.mobygames.com/game/6742/hired-guns/', gallerySection: 'DOS screenshots' },
    { title: 'Jill of the Jungle', site: 'MobyGames', url: 'https://www.mobygames.com/game/774/jill-of-the-jungle/', gallerySection: 'DOS screenshots' },
    { title: 'Jim Power', site: 'MobyGames', url: 'https://www.mobygames.com/game/31047/jim-power-the-lost-dimension-in-3d/', gallerySection: 'DOS screenshots' },
    { title: 'Lemmings', site: 'MobyGames', url: 'https://www.mobygames.com/game/683/lemmings/', gallerySection: 'DOS screenshots' },
    { title: 'Lemmings 2', site: 'MobyGames', url: 'https://www.mobygames.com/game/1603/lemmings-2-the-tribes/', gallerySection: 'DOS screenshots' },
    { title: 'Lemmings 3D', site: 'MobyGames', url: 'https://www.mobygames.com/game/2926/lemmings-3d/', gallerySection: 'DOS screenshots' },
    { title: 'Lotus III', site: 'MobyGames', url: 'https://www.mobygames.com/game/2020/lotus-the-ultimate-challenge/', gallerySection: 'DOS screenshots' },
    { title: 'Mortal Kombat', site: 'MobyGames', url: 'https://www.mobygames.com/game/599/mortal-kombat/', gallerySection: 'DOS screenshots' },
    { title: 'Mortal Kombat II', site: 'MobyGames', url: 'https://www.mobygames.com/game/600/mortal-kombat-ii/', gallerySection: 'DOS screenshots' },
    { title: 'Populous', site: 'MobyGames', url: 'https://www.mobygames.com/game/613/populous/', gallerySection: 'DOS screenshots' },
    { title: 'Raiden', site: 'MobyGames', url: 'https://www.mobygames.com/game/1317/raiden/', gallerySection: 'DOS screenshots' },
    { title: 'Sink or Swim', site: 'MobyGames', url: 'https://www.mobygames.com/game/1319/sink-or-swim/', gallerySection: 'DOS screenshots' },
    { title: 'Street Fighter II', site: 'MobyGames', url: 'https://www.mobygames.com/game/6239/street-fighter-ii/', gallerySection: 'DOS screenshots' },
    { title: 'Supaplex', site: 'MobyGames', url: 'https://www.mobygames.com/game/2106/supaplex/', gallerySection: 'DOS screenshots' },
    { title: 'Super Tetris', site: 'MobyGames', url: 'https://www.mobygames.com/game/606/super-tetris/', gallerySection: 'DOS screenshots' },
    { title: 'Test Drive III: The Passion', site: 'MobyGames', url: 'https://www.mobygames.com/game/158/test-drive-iii-the-passion/', gallerySection: 'DOS screenshots' },
    { title: 'Tetris Classic', site: 'MobyGames', url: 'https://www.mobygames.com/game/27780/tetris-classic/', gallerySection: 'DOS screenshots' },
    { title: 'Blues Brothers, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/193/the-blues-brothers/', gallerySection: 'DOS screenshots' },
    { title: 'Incredible Machine, The', site: 'MobyGames', url: 'https://www.mobygames.com/game/2473/the-incredible-machine/', gallerySection: 'DOS screenshots' },
    { title: 'Titus the Fox', site: 'MobyGames', url: 'https://www.mobygames.com/game/211/titus-the-fox-to-marrakech-and-back/', gallerySection: 'DOS screenshots' },
    { title: 'Transport Tycoon', site: 'MobyGames', url: 'https://www.mobygames.com/game/2283/transport-tycoon/', gallerySection: 'DOS screenshots' },
    { title: 'Utopia', site: 'MobyGames', url: 'https://www.mobygames.com/game/5985/utopia-the-creation-of-a-nation/', gallerySection: 'DOS screenshots' },
    { title: 'Vinyl Goddess from Mars', site: 'MobyGames', url: 'https://www.mobygames.com/game/1381/vinyl-goddess-from-mars/', gallerySection: 'DOS screenshots' },
    { title: 'Wing Commander', site: 'MobyGames', url: 'https://www.mobygames.com/game/3/wing-commander/', gallerySection: 'DOS screenshots' },
    { title: 'Wing Commander II: Vengeance of the Kilrathi', site: 'MobyGames', url: 'https://www.mobygames.com/game/823/wing-commander-ii-vengeance-of-the-kilrathi/', gallerySection: 'DOS screenshots' },
];
const LINKS = groupBy(LINKS_FLAT, ({ title }) => title);

const EMPTY_GALLERY = [];

async function fetchGame(url, source, options) {
    const systemsMapping = {
        'PC/AT': 'PC',
        'PC/XT': 'PC',
    };
    const html = await (await fetch(url)).text();
    const doc = new dom({ errorHandler: {
        warning: w => {},
        error: e => {},
        fatalError: e => { console.error(e) },
    }}).parseFromString(html);
    const h1 = xpath.select1("//h1", doc);
    const game = options?.game ?? h1.textContent;
    const hardwareSection = xpath.select1("//section[contains(@class, 'hardware')]", doc);
    const systemsStrings = sequenceUntil(
        xpath.select1("./small[normalize-space(text()) = 'Systems:' or normalize-space(text()) = 'System:']", hardwareSection),
        "./following-sibling::span",
        "./following-sibling::small",
    ).map(span => xpath.select1("normalize-space(./a/text())", span));
    const systems = Object.keys(indexBy(systemsStrings, system => systemsMapping[system]));
    if (systems.length != 1) console.warn(`game: ${url} systems: ${systems}`);
    const platform = systems[0];
    const composersSection = xpath.select1("//section[contains(@class, 'composers')]", doc);
    const composers = sequenceUntil(
        xpath.select1("./small[normalize-space(text()) = 'Composer:' or normalize-space(text()) = 'Composers:']", composersSection),
        "./following-sibling::span",
        "./following-sibling::small",
    ).map(span => xpath.select1("normalize-space(./a/text())", span));
    const companiesSection = xpath.select1("//section[contains(@class, 'companies')]", doc);
    const developers = sequenceUntil(
        xpath.select1("./small[normalize-space(text()) = 'Developer:' or normalize-space(text()) = 'Developers:']", companiesSection),
        "./following-sibling::span",
        "./following-sibling::small",
    ).map(span => xpath.select1("normalize-space(./a/text())", span));
    const publishers = sequenceUntil(
        xpath.select1("./small[normalize-space(text()) = 'Publisher:' or normalize-space(text()) = 'Publishers:']", companiesSection),
        "./following-sibling::span",
        "./following-sibling::small",
    ).map(span => xpath.select1("normalize-space(./a/text())", span));
    const releaseDate = xpath.select1("./small[normalize-space(text()) = 'Release date:']", companiesSection);
    const year = xpath.select1("normalize-space(./following-sibling::text())", releaseDate)?.match(/^\d{4}/)[0];
    const table = xpath.select1("//table[contains(@class, 'playlist')]", doc);
    const rows = xpath.select(".//tr[@id]", table);

    const songLinks = rows.map(row => xpath.select1("string(./td[contains(@class, 'links')]//a/@href)", row));
    const links = await fetchGalleries(LINKS[game] ?? []);
    const galleryCount = countGalleries(links);
    console.log(game, songLinks.length, { gallery: galleryCount });
    if (galleryCount === 0 && !EMPTY_GALLERY.includes(game))
        throw new Error('empty gallery');

    const gameDir = `${platform}/${game.replace(/:/g, '')}`;
    try {
        fs.mkdirSync(gameDir, { recursive: true });
    } catch {}
    let files = fs.readdirSync(gameDir).sort();
    if (files.length < songLinks.length) {
        const archiveLink = xpath.select1("string(//a[normalize-space(text()) = 'Download']/@href)", doc);
        console.info(`downloading ${archiveLink} ...`);
        const archive = await (await fetch(archiveLink)).arrayBuffer();
        const entries = new AdmZip(Buffer.from(archive)).getEntries().filter(entry => entry.name.match(/\.vg[mz]$/i));
        entries.forEach(entry => {
            fs.writeFileSync(`${gameDir}/${entry.name.replace(/#/g, '')}`, entry.getData());
        });
        files = fs.readdirSync(gameDir).sort();
    }

    const songs = files.map(file => ({
        song: file,
        song_link: `${source}/${gameDir}/${file}`,
        size: vgmSize(`${gameDir}/${file}`),
        composer: composers.join(', '),
    }));
    return { game, platform, developers, publishers, year, source, source_link: url, links, songs };
}

function vgmSize(file) {
    const size = fs.statSync(file).size;
    if (!file.toLowerCase().endsWith('.vgz')) return size;
    const buffer = Buffer.alloc(4);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, buffer, 0, 4, size - 4);
    fs.closeSync(fd);
    return buffer.readUInt32LE(0);
}

async function fetchVGMRips(source) {
    const games = [
        'https://vgmrips.net/packs/pack/all-new-world-of-lemmings-ibm-pc-at',
        'https://vgmrips.net/packs/pack/alone-in-the-dark-pc',
        'https://vgmrips.net/packs/pack/alone-in-the-dark-2-ibm-pc-at',
        'https://vgmrips.net/packs/pack/arkanoid-ii-revenge-of-doh-ibm-pc-xt-at',
        'https://vgmrips.net/packs/pack/bc-racers-ibm-pc-at',
        'https://vgmrips.net/packs/pack/body-blows-ibm-pc-at',
        'https://vgmrips.net/packs/pack/bubble-bobble-ibm-pc-xt-at',
        'https://vgmrips.net/packs/pack/budokan-the-martial-spirit-ibm-pc-xt-at',
        'https://vgmrips.net/packs/pack/castlevania-ibm-pc-xt-at',
        'https://vgmrips.net/packs/pack/cool-spot-ibm-pc-at',
        'https://vgmrips.net/packs/pack/curse-of-enchantia-pc',
        'https://vgmrips.net/packs/pack/dark-seed-ibm-pc-at',
        'https://vgmrips.net/packs/pack/dyna-blaster-ibm-pc-at',
        'https://vgmrips.net/packs/pack/elvira-mistress-of-the-dark-ibm-pc-at',
        'https://vgmrips.net/packs/pack/elvira-ii-the-jaws-of-cerberus-ibm-pc-at',
        'https://vgmrips.net/packs/pack/flashback-ibm-pc-at',
        'https://vgmrips.net/packs/pack/fury-of-the-furries',
        'https://vgmrips.net/packs/pack/golden-axe-ibm-pc-xt-at-adlib',
        'https://vgmrips.net/packs/pack/hired-guns-ibm-pc-at',
        'https://vgmrips.net/packs/pack/jill-of-the-jungle-ibm-pc-at',
        'https://vgmrips.net/packs/pack/jim-power-the-lost-dimension-in-3d-ibm-pc-at',
        'https://vgmrips.net/packs/pack/lemmings-series-ibm-pc-at',
        'https://vgmrips.net/packs/pack/lemmings-2-the-tribes-ibm-pc-at',
        'https://vgmrips.net/packs/pack/lemmings-3d-pc',
        'https://vgmrips.net/packs/pack/lotus-the-ultimate-challenge-ibm-pc-at',
        'https://vgmrips.net/packs/pack/mortal-kombat-ibm-pc-at',
        'https://vgmrips.net/packs/pack/mortal-kombat-ii-ibm-pc-at',
        'https://vgmrips.net/packs/pack/populous-pc',
        'https://vgmrips.net/packs/pack/raiden-ibm-pc-at',
        'https://vgmrips.net/packs/pack/sink-or-swim-ibm-pc-at',
        'https://vgmrips.net/packs/pack/street-fighter-ii-ibm-pc-at',
        'https://vgmrips.net/packs/pack/supaplex-ibm-pc-at',
        'https://vgmrips.net/packs/pack/super-tetris-ibm-pc-at',
        'https://vgmrips.net/packs/pack/test-drive-iii-the-passion-ibm-pc-xt-at',
        'https://vgmrips.net/packs/pack/tetris-classic',
        'https://vgmrips.net/packs/pack/the-blues-brothers-pc',
        'https://vgmrips.net/packs/pack/the-incredible-machine-ibm-pc-at',
        'https://vgmrips.net/packs/pack/titus-the-fox-to-marrakech-and-back-pc',
        'https://vgmrips.net/packs/pack/transport-tycoon-ibm-pc-at',
        'https://vgmrips.net/packs/pack/utopia-the-creation-of-a-nation-ibm-pc-at',
        'https://vgmrips.net/packs/pack/vinyl-goddess-from-mars-ibm-pc-at',
        'https://vgmrips.net/packs/pack/wing-commander-ibm-pc-at',
        'https://vgmrips.net/packs/pack/wing-commander-ii-vengeance-of-the-kilrathi-ibm-pc-at',
    ];
    const gameOptions = {
        'https://vgmrips.net/packs/pack/all-new-world-of-lemmings-ibm-pc-at': { game: 'All New World Of Lemmings' },
        'https://vgmrips.net/packs/pack/alone-in-the-dark-2-ibm-pc-at': { game: 'Alone in the Dark 2' },
        'https://vgmrips.net/packs/pack/budokan-the-martial-spirit-ibm-pc-xt-at': { game: 'Budokan' },
        'https://vgmrips.net/packs/pack/elvira-mistress-of-the-dark-ibm-pc-at': { game: 'Elvira' },
        'https://vgmrips.net/packs/pack/elvira-ii-the-jaws-of-cerberus-ibm-pc-at': { game: 'Elvira II' },
        'https://vgmrips.net/packs/pack/jim-power-the-lost-dimension-in-3d-ibm-pc-at': { game: 'Jim Power' },
        'https://vgmrips.net/packs/pack/lemmings-series-ibm-pc-at': { game: 'Lemmings' },
        'https://vgmrips.net/packs/pack/lemmings-2-the-tribes-ibm-pc-at': { game: 'Lemmings 2' },
        'https://vgmrips.net/packs/pack/lotus-the-ultimate-challenge-ibm-pc-at': { game: 'Lotus III' },
        'https://vgmrips.net/packs/pack/the-blues-brothers-pc': { game: 'Blues Brothers, The' },
        'https://vgmrips.net/packs/pack/the-incredible-machine-ibm-pc-at': { game: 'Incredible Machine, The' },
        'https://vgmrips.net/packs/pack/titus-the-fox-to-marrakech-and-back-pc': { game: 'Titus the Fox' },
        'https://vgmrips.net/packs/pack/transport-tycoon-ibm-pc-at': { game: 'Transport Tycoon' },
        'https://vgmrips.net/packs/pack/utopia-the-creation-of-a-nation-ibm-pc-at': { game: 'Utopia' },
    };

    return (await sequential(games.map(game => () =>
        fetchGame(game, source, gameOptions[game])
    ))).filter(game => game);
}

exports.fetchVGMRips = fetchVGMRips;
