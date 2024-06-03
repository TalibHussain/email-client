// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// <IndexRouterSnippet>
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', async function (req, res) {

  let userProfile = await getUserProfile(req);
  req.app.locals.userProfile = userProfile;

  res.render('index', { userProfile });
});

// Assuming you're using Express.js
router.post('/', async (req, res) => {
  // Handle form submission here (e.g., process form data)
  var body = req.body;

  const updateResponse = await req.app.locals.elasticsearch.index({
    index: "user_profile",
    body: {
      first_name: body.first_name,
      last_name: body.last_name,
    }
  }, (err, resp, status) => {
    console.log(resp);
  });

  res.redirect('/');

});

async function getUserProfile(req) {
  try {
    const response = await req.app.locals.elasticsearch.search({
      index: 'user_profile'
    });
    // Assuming the search results contain a single hit (user profile)
    const userProfile = response.hits.hits[0]._source;

    return userProfile; // Return true if the search was successful
  } catch (error) {
    console.error('Error searching for user profile:', error);
    return false; // Handle the error or return false if the search fails
  }
}

module.exports = router;
// </IndexRouterSnippet>
