const request = require('superagent')
const express = require('express')
const Webtask = require('webtask-tools')
const bodyParser = require('body-parser')
const getSlackEmails = require('./get-slack-emails')
const slackButton = require('./slack-button')

const app = express()

app.use(bodyParser.urlencoded({extended: true}))

app.use((req, res, next) => {
  // get env secrets
  req.slackVerification = req.webtaskContext.secrets.SLACK_VERIFICATION
  req.slackSecret = req.webtaskContext.secrets.SLACK_SECRET
  req.sharelockUrl = req.webtaskContext.secrets.SHARELOCK_URL || 'https://sharelock.io'

  if (!req.slackVerification || !req.slackSecret) {
    return res.status(400).send('App is missing SLACK_VERIFICATION or SLACK_SECRET keys')
  }
  next()
})

app.use('/oauth', slackButton)

// verify request body and token
app.post('/', (req, res, next) => {
  if (!req.body) {
    return res.send()
  }

  if (req.body.token !== req.slackVerification) {
    return res.send('Missing or incompatible Slack verification token.')
  }

  req.teamId = req.body.team_id
  req.username = req.body.user_name
  req.message = req.body.text
  req.responseUrl = req.body.response_url

  if (!req.message) {
    return res.send('Please share something: `/secret some-super-secret`')
  }

  // we respond OK to slack immediately. we'll use the response url later to
  // post the result link
  res.send()

  next()
})

// see if we have a previously saved access token for this user's team
// this uses Webtask's storage https://webtask.io/docs/storage
app.post('/', (req, res, next) => {
  req.webtaskContext.storage.get((err, data = {}) => {
    if (err) {
      return respond({url: req.responseUrl, message: err.message})
    }

    req.slackToken = data[req.teamId]

    if (!data[req.teamId]) {
      // we don't have access token for this team
      return respond({url: req.responseUrl, message: 'no access token stored for your team'})
    }

    next()
  })
})

// get email addresses of all users in the channel the message was posted in
app.post('/', (req, res, next) => {
  const channelName = req.body.channel_name
  const channelId = req.body.channel_id
  getSlackEmails({token: req.slackToken, channelName, channelId}, (err, emails) => {
    if (err) {
      return respond({url: req.responseUrl, message: err.message})
    }

    // remove bots with no email addresses
    emails = emails.filter((e) => e)
    if (!emails.length) {
      return respond({url: req.responseUrl, message: "Looks like there's no one to share with here."})
    }

    req.emails = emails
    next()
  })
})

// create a sharelock url by using sharelock.io (unpublished) api
app.post('/', (req, res, next) => {
  request.post(`${req.sharelockUrl}/create`)
  .send({d: req.message, a: req.emails.join(', ')})
  .end((err, response) => {
    if (err) {
      return respond({url: req.responseUrl, message: err.message})
    }

    const message = `@${req.username} shared a secure message with you:\n> ${req.sharelockUrl}${response.text}`
    respond({url: req.responseUrl, type: 'in_channel', message})
  })
})

function respond ({url, type = 'ephemeral', message}, callback = () => {}) {
  request.post(url)
  .send({
    response_type: type,
    text: message
  })
  .end((err, response) => {
    if (err) {
      return callback(err)
    }

    callback(null, response.body)
  })
}

module.exports = Webtask.fromExpress(app)
