const request = require('superagent')
const express = require('express')
const Webtask = require('webtask-tools')
const bodyParser = require('body-parser')
const getSlackEmails = require('./get-slack-emails')

const slackToken = process.env.SLACK_TOKEN
const slackVerification = process.env.SLACK_VERIFICATION
const sharelockUrl = process.env.SHARELOCK_URL || 'https://sharelock.io'

if (!slackToken) { throw new Error('Missing slack oauth token') }
if (!slackVerification) { throw new Error('Missing slack verification token') }

const app = express()

app.use(bodyParser.urlencoded({extended: true}))

// verify request body and token
app.post('/', (req, res, next) => {
  if (!req.body) {
    return res.status(400).send()
  }

  if (req.body.token !== slackVerification) {
    return res.status(400).send('Missing or incompatible Slack verification token.')
  }

  req.username = req.body.username
  req.message = req.body.text
  req.responseUrl = req.body.response_url

  // we respond to slack immidiately. we'll use the response url later to
  // post the result link
  res.send()

  next()
})

// get email addresses of all users in the channel the message was posted in
app.post('/', (req, res, next) => {
  const channelName = req.body.channel_name
  const channelId = req.body.channel_id
  getSlackEmails({token: slackToken, channelName, channelId}, (err, emails) => {
    if (err) {
      return console.error(err.message)
    }
    req.emails = emails
    next()
  })
})

// create a sharelock url by using sharelock.io (unpublished) api
app.post('/', (req, res, next) => {
  request.post(`${sharelockUrl}/create`)
  .send({d: req.message, a: req.emails.join(', ')})
  .end((err, response) => {
    if (err) {
      return console.error(err.message)
    }

    req.secretUrl = sharelockUrl + response.text
    next()
  })
})

// the total request time is usually more than 3000 ms (slack's limit) so we need
// to use the response url to send a new response after that time
app.post('/', (req, res, next) => {
  request.post(req.responseUrl)
  .send({
    response_type: 'in_channel',
    text: req.secretUrl
  })
  .end((err, response) => {
    if (err) {
      console.error(err.message)
    }
  })
})

module.exports = Webtask.fromExpress(app)
