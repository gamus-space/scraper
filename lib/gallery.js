'use strict';

const fs = require('fs');
const { URL } = require('url');
const fetch = require('node-fetch');
const dom = require('xmldom').DOMParser;
const xpath = require('xpath');

Object.assign(exports, { countGalleries, fetchGalleries, saveGalleryCache });

const lemonAmigaCache = JSON.parse(fs.readFileSync('cache/gallery/LemonAmiga.json', 'utf-8'));
function saveGalleryCache() {
    fs.writeFileSync('cache/gallery/LemonAmiga.json', JSON.stringify(lemonAmigaCache, null, 2));
}

const getGallery = {
    'Lemon Amiga': async ({ url }) => {
        if (lemonAmigaCache[url]) return lemonAmigaCache[url];
        const response = await fetch(url);
        if (!response.ok) {
            console.error('http status', response.status, response.statusText);
            console.error('http body', await response.text());
            return undefined;
        }
        const html = await (response).text();
        const doc = new dom({ errorHandler: () => {} }).parseFromString(html, 'text/html');
        const gal = xpath.select1("//*[name() = 'div' and contains(@class, 'screenshot-gallery')]", doc);
        const gallery = gal && xpath.select(".//*[name() = 'img']", gal).map(a => new URL(a.getAttribute('src'), url).href.replace(/^http\:\/\//, 'https://'));
        lemonAmigaCache[url] = gallery;
        return gallery;
    },
    'MobyGames': async ({ url, gallerySection }) => {
        gallerySection ??= 'DOS screenshots';
        const html = await (await fetch(`${url}/screenshots`)).text();
        const doc = new dom({ errorHandler: () => {} }).parseFromString(html, 'text/html');
        const gal = xpath.select1(`//*[name() = 'h2' and normalize-space() = '${gallerySection}']/following-sibling::*[contains(@class, 'img-holder')]`, doc);
        return gal && xpath.select("./*[name() = 'figure']", gal).map(figure => xpath.select1("string(.//*[name() = 'img']/@src)", figure));
    },
};

async function fetchGalleries(links) {
    return await Promise.all(links.map(async link => ({
        ...link,
        gallery: await getGallery[link.site]?.(link),
    })));
}

function countGalleries(links) {
    return (links || []).reduce((count, link) => count + (link.gallery?.length ?? 0), 0);
}
