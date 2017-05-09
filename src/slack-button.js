const express = require('express')
const request = require('superagent')
const clientId = '2348108152.180459748356'
const app = express.Router()

app.get('/', (req, res, next) => {
  const code = req.query.code
  request.get('https://slack.com/api/oauth.access')
  .query({
    code: code,
    client_id: clientId,
    client_secret: req.slackSecret

  })
  .end((err, response) => {
    if (err) {
      return res.status(500).send(err.message)
    }

    if (!response.body.ok) {
      return res.status(500).send('something bad happened')
    }

    // write the access token to the webtask storage keyed by the team id
    req.webtaskContext.storage.get((err, data = {}) => {
      if (err) {
        return res.status(500).send(err.message)
      }
      data[response.body.team_id] = response.body.access_token

      req.webtaskContext.storage.set(data, (err) => {
        if (err) {
          return res.status(500).send(err.message)
        }
        res.send(`App added to ${response.body.team_name}!`)
      })
    })
  })
})

module.exports = app
