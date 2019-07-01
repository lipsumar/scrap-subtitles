const { EventEmitter } = require('events')
const { google } = require('googleapis');
const customsearch = google.customsearch('v1');
const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs')
const http = require('https')
const yauzl = require("yauzl");


class ScrapSubtitle extends EventEmitter {
  constructor({ googleApiKey, googleCx }) {
    super()
    this.googleApiKey = googleApiKey
    this.googleCx = googleCx
  }

  async find(movieName) {
    const candidates = await this.findCandidates(movieName)
    this.emit('subtitles-candidates', candidates)
    if (candidates.length === 0) {
      throw new Error('cant find candidates')
    }
    return this.fetchCandidate(candidates[0])
  }

  async fetchCandidate(candidate){
    const subtitlePageUrl = 'https://subscene.com' + candidate.url
    const zipUrl = await this._findZipUrl(subtitlePageUrl)
    this.emit('zip-url', zipUrl)

    const fileUnique = this.getUniqueDir()
    fs.mkdirSync(`/tmp/${fileUnique}/out`, { recursive: true })
    const zipPath = `/tmp/${fileUnique}/subtitle.zip`
    await this._download(zipUrl, zipPath)
    this.emit('downloaded', zipPath)

    const finalPath = `/tmp/${fileUnique}/out/`
    await this._unzip(zipPath, finalPath)

    const files = await this._getFilesInDir(finalPath)

    return this._readFiles(
      files
        .filter(f => f.substr(f.length - 4, 4) === '.srt')
        .map(f => finalPath + f)
    )
  }

  async findCandidates(movieName){
    const googleResults = await this._googleCustomSearch(movieName)
    if (!googleResults) {
      throw new Error('No google result')
    }
    this.emit('google-results', googleResults)

    const bestResult = this._pickBestGoogleResult(googleResults.data.items, movieName)
    console.log('picked', bestResult)

    const subtitles = await this._getSubsceneSubtitleList(bestResult.link)
    this.emit('subtitles', subtitles)

    return subtitles.filter(s => s.hi && s.language === 'English')
  }

  _pickBestGoogleResult(items, movieName){
    const theOne = items.find(item => item.title.toLowerCase() === `subtitles for ${movieName.toLowerCase()} - subscene`)
    if(theOne) return theOne

    const subtitlesFor = items.filter(item => item.title.substr(0, 14) === 'Subtitles for ')
    if(subtitlesFor.length === 0){
      throw new Error('cant pick google result')
    }
    return subtitlesFor[0]
  }

  async _readFiles(files) {
    return Promise.all(files.map(f => {
      return new Promise((resolve, reject) => {
        fs.readFile(f, (err, data) => {
          if (err) reject(err)
          else {
            const filenamePieces = f.split('/')
            resolve({
              filename: filenamePieces.pop(),
              content: data.toString()
            })
          }
        })
      })
    }))
  }

  getUniqueDir() {
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

  async _findZipUrl(subtitlePageUrl) {
    const resp = await axios.get(subtitlePageUrl)
    const $ = cheerio.load(resp.data)
    const url = $('div.download a').attr('href')
    return 'https://subscene.com' + url
  }

  async _download(url, dest) {
    return new Promise(resolve => {
      var file = fs.createWriteStream(dest);
      http.get(url, function (response) {
        response.pipe(file);
        file.on('finish', function () {
          file.close(resolve);
        });
      });
    })

  }

  async _unzip(fromPath, toPath) {
    return new Promise(resolve => {
      yauzl.open(fromPath, { lazyEntries: true }, function (err, zipfile) {
        if (err) throw err;
        zipfile.readEntry();
        zipfile.on("entry", function (entry) {
          if (/\/$/.test(entry.fileName)) {
            // Directory file names end with '/'.
            // Note that entires for directories themselves are optional.
            // An entry's fileName implicitly requires its parent directories to exist.
            zipfile.readEntry();
          } else {
            // file entry
            if (!/\.srt$/.test(entry.fileName)) return
            var file = fs.createWriteStream(toPath + entry.fileName);
            zipfile.openReadStream(entry, function (err, readStream) {
              if (err) throw err;
              readStream.on("end", function () {
                zipfile.readEntry();
              });
              readStream.pipe(file);
            });
          }
        });
        zipfile.on('end', resolve)
      });
    })

  }

  async _getFilesInDir(dir) {
    console.log('dir', dir)

    return new Promise(resolve => {
      fs.readdir(dir, (err, files) => {
        if (err) throw err
        console.log('files', files)
        resolve(files)
      });
    })

  }

}

module.exports = ScrapSubtitle