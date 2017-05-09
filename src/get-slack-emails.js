const request = require('superagent')

module.exports = function ({token, channelName, channelId}, callback) {
  if (!token) { throw new Error('Missing slack oauth token') }

  function slackRequest (method, query = {}, cb) {
    query.token = token
    request.get(`https://slack.com/api/${method}`)
    .query(query)
    .end((err, response) => {
      if (err) {
        return cb(err)
      }
      if (!response.body.ok) {
        return cb(new Error(`Something bad happened: ${response.body.error}`))
      }
      return cb(null, response.body)
    })
  }

  let method
  switch (channelName) {
    case 'directmessage':
      method = 'im.list'
      break
    case 'privategroup':
      method = 'groups.info'
      break
    default:
      method = 'channels.info'
  }

  slackRequest(method, {channel: channelId}, (err, response) => {
    if (err) {
      return callback(err)
    }

    let users
    // need to access users differently for each channel type
    if (channelName === 'directmessage') {
      users = response.ims
      .filter((im) => !im.is_user_deleted && im.id === channelId)
      .map((im) => im.user)
    } else if (channelName === 'privategroup') {
      users = response.group.members
    } else {
      users = response.channel.members
    }

    slackRequest('users.list', {}, (err, response) => {
      if (err) {
        return callback(err)
      }

      const emails = response.members
      .filter((u) => users.indexOf(u.id) !== -1)
      .map((u) => u.profile.email)

      return callback(null, emails)
    })
  })
}
