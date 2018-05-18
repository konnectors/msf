const {
  BaseKonnector,
  requestFactory,
  signin,
  scrape,
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

// The goal of this function is to parse a html page wrapped by a cheerio instance
// and return an array of js objects which will be saved to the cozy by saveBills (https://github.com/cozy/cozy-konnector-libs/blob/master/docs/api.md#savebills)
function parseDocuments($) {
  // you can find documentation about the scrape function here :
  // https://github.com/konnectors/libs/blob/master/packages/cozy-konnector-libs/docs/api.md#scrape
  const docs = scrape(
    $,
    {
      title: {
        sel: 'tr td.arial_16_gray',
        parse: normalizeTitle
      },
      amount: {
        sel: 'tr .arial_14_gray_bold',
        parse: normalizePrice
      },
      fileurl: {
        sel: 'tr td a',
        attr: 'href',
        parse: url => `${baseUrl}${url}`
      },
      filename: {
        sel: 'tr td a',
        parse: title => `${title}.pdf`
      }
    },
    'table table table'
  )
  let docs2 = docs.filter(doc => doc.title != '' && !isNaN(doc.amount))
  log('info', docs2)
  return docs2.map(doc => ({
    ...doc,
    // the saveBills function needs a date field
    // even if it is a little artificial here (these are not real bills)
    date: new Date(),
    currency: '€',
    vendor: 'template',
    metadata: {
      // it can be interesting that we add the date of import. This is not mandatory but may be
      // usefull for debugging or data migration
      importDate: new Date(),
      // document version, usefull for migration after change of document structure
      version: 1
    }
  }))
}

function normalizeTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function normalizePrice(price) {
  return parseFloat(
    price
      .replace('Total', '')
      .replace(/€.*/, '')
      .trim()
  )
}
