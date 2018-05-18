const {
  BaseKonnector,
  requestFactory,
  signin,
  saveBills,
  log
} = require('cozy-konnector-libs')
const request = requestFactory({
  cheerio: true,
  json: false,
  jar: true
})

const baseUrl = 'https://don.msf.fr'

module.exports = new BaseKonnector(start)

async function start(fields) {
  log('info', 'Authenticating ...')
  await authenticate(fields.login, fields.password)
  log('info', 'Successfully logged in')
  log('info', 'Fetching the list of documents')
  const form = {
    form: {
      anneeDon: 'tous',
      typeDon: 'tous'
    }
  }
  const $ = await request.post(
    `${baseUrl}/donateur/historic.php?ent_codsoc=ASSO`,
    form
  )
  log('info', 'Parsing list of documents')
  const documents = await parseDocuments($)
  log('info', 'Saving data to Cozy')
  await saveBills(documents, fields.folderPath, {
    identifiers: ['MEDECINS SANS FRONTIERES', 'MSF']
  })
}

function authenticate(username, password) {
  return signin({
    url: baseUrl + `/donateur/index.php`,
    formSelector: 'form',
    formData: { login: username, password: password },
    validate: (statusCode, $) => {
      if ($(`a[href='/donateur/deconnexion.php']`).length === 1) {
        return true
      } else {
        log('error', $('.error').text())
        return false
      }
    }
  })
}

async function parseDocuments($) {
  let docs = []
  const tables = $('table table table')
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i]
    const file = await extractFile($(table).find('tr td a'))
    const rows = $(table).find('tr')
    rows.each((j, row) => {
      const cells = $(row).find('td')
      if (cells.length == 5 && $(cells[1]).text() === 'DON') {
        const date = $(cells[0]).text()
        let doc = {
          title: 'Don du ' + date,
          amount: normalizePrice($(cells[3]).text()),
          date: normalizeDate(date)
        }
        if (file) {
          doc = { ...doc, ...file }
        }
        docs.push(doc)
      }
    })
  }
  return docs.map(doc => ({
    ...doc,
    currency: '€',
    vendor: 'MSF',
    metadata: {
      importDate: new Date(),
      version: 1
    }
  }))
}

async function extractFile(link) {
  if (link.length == 0) {
    return
  }
  const pageUrl = baseUrl + link.attr('href')
  const $a = await request(pageUrl)
  const file = {
    filename: `${link.text()}.pdf`,
    fileurl: $a('#lien_download').attr('href')
  }
  // const dl = $a.html().match(/"(.*)"/)[1]
  // log('info', {dl})
  // const $b = await request({
  //   uri: baseUrl + '/' + dl,
  //   headers: {
  //     referer: pageUrl
  //   }
  // })
  // log('info', $b.html())
  // const file = {
  //   filename: `${link.text()}.pdf`,
  //   fileurl: $b('#lien_download').attr('href')
  // }
  log('info', file)
  return file
}

function normalizePrice(price) {
  return parseFloat(
    price
      .replace('Total', '')
      .replace(/€.*/, '')
      .trim()
  )
}

function normalizeDate(date) {
  const parts = date.split('/')
  return new Date(parts[2], parts[1], parts[0], 12)
}
