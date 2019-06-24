const { EventEmitter } = require('events')
const { google } = require('googleapis');
const customsearch = google.customsearch('v1');
const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('https')
const unzip = require('unzip')


class ScrapSubtitle extends EventEmitter {
  constructor({ googleApiKey, googleCx }) {
    super()
    this.googleApiKey = googleApiKey
    this.googleCx = googleCx
  }

  async find(movieName) {
    const googleResults = await this._googleCustomSearch(movieName)
    if (!googleResults) {
      throw new Error('No google result')
    }
    this.emit('google-results', googleResults)

    const firstResult = googleResults.data.items[0]

    const subtitles = await this._getSubsceneSubtitleList(firstResult.link)
    this.emit('subtitles', subtitles)

    const candidates = subtitles.filter(s => s.hi && s.language === 'English')
    this.emit('subtitles-candidates', candidates)
    if(candidates.length === 0){
      throw new Error('cant find candidates')
    }

    const subtitlePageUrl = 'https://subscene.com' + candidates[0].url
    const zipUrl = await this._findZipUrl(subtitlePageUrl)
    this.emit('zip-url', zipUrl)

    const fileUnique = this.getUniqueDir()
    fs.mkdirSync(`/tmp/${fileUnique}`)
    const zipPath = `/tmp/${fileUnique}/subtitle.zip`
    await this._download(zipUrl, zipPath)
    this.emit('downloaded', zipPath)

    const finalPath = `/tmp/${fileUnique}/out/`
    await this._unzip(zipPath, finalPath)

    const files = await this._getFilesInDir(finalPath)

    return files.map(f => finalPath + f)
  }

  getUniqueDir(){
    return 'scrap_subtitle_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  async _googleCustomSearch(q) {
    return await customsearch.cse.list({
      cx: this.googleCx,
      q,
      auth: this.googleApiKey
    });
  }

  async _getSubsceneSubtitleList(url) {
    const resp = await axios.get(url)
    const $ = cheerio.load(resp.data)

    const subtitles = []
    $('table tr').each((i, tr) => {

      if (i === 0) return //skip header
      const $tr = $(tr)
      const tds = $tr.find('td')

      if (tds.length != 5) return // skip non-listing rows

      const link = $(tds.get(0)).find('a')
      const qualitySpan = $(link).find('span').get(0)
      const nameSpan = $(link).find('span').get(1)

      subtitles.push({
        url: link.attr('href'),
        name: $(nameSpan).text().trim(),
        language: $(qualitySpan).text().trim(),
        quality: $(qualitySpan).hasClass('positive-icon') ? 'positive' : 'neutral',
        hi: $(tds.get(2)).hasClass('a41')
      })
    })

    return subtitles
  }

  async _findZipUrl(subtitlePageUrl){
    const resp = await axios.get(subtitlePageUrl)
    const $ = cheerio.load(resp.data)
    const url = $('div.download a').attr('href')
    return 'https://subscene.com' + url
  }

  async _download(url, dest){
    return new Promise(resolve => {
      var file = fs.createWriteStream(dest);
      http.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
          file.close(resolve);
        });
      });
    })
    
  }

  async _unzip(fromPath, toPath){
    return new Promise(resolve => {
      fs.createReadStream(fromPath).pipe(
        unzip.Extract({ path: toPath })
      ).on('finish', () => {
        resolve()
      })
    })
  }

  async _getFilesInDir(dir){
    return new Promise(resolve => {
      fs.readdir(dir, (err, files) => {
        resolve(files)
      });
    })
    
  }

}

module.exports = ScrapSubtitle