const ScrapSubtitle = require('./ScrapSubtitles')

const scrapper = new ScrapSubtitle({
  // you need to setup a "Google Custom Search API" for this to work
  googleApiKey: 'your google api key for "Custom Search API"',
  // you also need a CX token => https://cse.google.com/cse/setup/basic
  googleCx: 'your CX id'
})

scrapper
  .on('google-results', googleResults => {
    console.log(`Found ${googleResults.data.items.length} results on Google`)
  })
  .on('subtitles', subtitles => {
    console.log(`Found ${subtitles.length} subtitles`)
  })
  .on('subtitles-candidates', candidates => {
    console.log(`Found ${candidates.length} candidates`)
  })
  .on('zip-url', zipUrl => {
    console.log('Found zip url:', zipUrl)
  })
  .on('downloaded', zipPath => {
    console.log(`Downloaded ${zipPath}`)
  })

scrapper.find('Dr house').then(file => {
  console.log('=>', file)
}).catch(err => {
  console.log(err.message)
})