// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

const { id } = require('date-fns/locale');
const graph = require('../graph');
const router = require('express-promise-router').default();
const { v4: uuidv4 } = require('uuid');


/* GET auth callback. */
router.get('/signin',
  async function (req, res) {
    const scopes = process.env.OAUTH_SCOPES || 'https://graph.microsoft.com/.default';
    const urlParameters = {
      scopes: scopes.split(','),
      redirectUri: process.env.OAUTH_REDIRECT_URI
    };

    try {
      const authUrl = await req.app.locals
        .msalClient.getAuthCodeUrl(urlParameters);

      console.log("redirect url : " + authUrl);
      res.redirect(authUrl);
    }
    catch (error) {
      console.log(`Error: ${error}`);
      req.flash('error_msg', {
        message: 'Error getting auth URL',
        debug: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      res.redirect('/');
    }
  }
);

// <CallbackSnippet>
router.get('/callback',
  async function (req, res) {
    const scopes = process.env.OAUTH_SCOPES || 'https://graph.microsoft.com/.default';

    const tokenRequest = {
      code: req.query.code,
      scopes: scopes.split(','),
      redirectUri: process.env.OAUTH_REDIRECT_URI
    };

    try {

      const response = await req.app.locals
        .msalClient.acquireTokenByCode(tokenRequest);
      // Save the user's homeAccountId in their session

      req.session.userId = response.account.homeAccountId;

      const user = await graph.getUserDetails(
        req.app.locals.msalClient,
        req.session.userId
      );

      const messages = await graph
        .getUserMessages(
          req.app.locals.msalClient,
          req.session.userId);


          const updatedAccounts = [
            {
              access_token: response.accessToken,
              id_token: response.idToken,
              token_type: response.tokenType,
              email_address: response.account.username,
              tenant_id: response.account.tenantId,
              authority_type: response.account.authorityType,
              emails: messages
            }
            // Add other account details as needed
          ];
          const success = await updateUserAccount(req, response.account.username, updatedAccounts);
          if (success) {
            console.log('User accounts updated successfully!');
          } else {
            console.log('Failed to update user accounts.');
          }
    
      // Add the user to user storage
      req.app.locals.users[req.session.userId] = {
        displayName: user.displayName,
        email: user.mail || user.userPrincipalName,
        timeZone: user.mailboxSettings.timeZone,
        messages111: messages.value
      };
    } catch (error) {
      req.flash('error_msg', {
        message: 'Error completing authentication',
        debug: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
    }
    res.redirect('/');
  }
);
// </CallbackSnippet>

router.get('/signout',
  async function (req, res) {
    // Sign out
    if (req.session.userId) {
      // Look up the user's account in the cache
      const accounts = await req.app.locals.msalClient
        .getTokenCache()
        .getAllAccounts();

      const userAccount = accounts.find(a => a.homeAccountId === req.session.userId);

      // Remove the account
      if (userAccount) {
        req.app.locals.msalClient
          .getTokenCache()
          .removeAccount(userAccount);
      }
    }

    // Destroy the user's session
    req.session.destroy(function () {
      res.redirect('/');
    });
  }
);



router.get('/messages',
  async function (req, res) {
    // Sign out
    if (req.session.userId) {
      // Look up the user's account in the cache
      const messages = await graph.getUserEmails(
        req.app.locals.msalClient,
        req.session.userId
      );

      console.log("messages:" + messages);


      res.redirect('/', messages);

    }

  }
);



async function updateUserAccount(req, emailId, updatedAccounts) {
  try {
    // Assuming you have a unique identifier (e.g., userId) for the user profile
    const indexName = 'user_profile';

    const userProfile = await req.app.locals.elasticsearch.search({
      index: 'user_profile'
    });
    // Assuming the search results contain a single hit (user profile)
    const userProfileData = userProfile.hits.hits[0]._source;

    let account = await getUserAccount(req, emailId);

    if (account == null) {
      // add new data 
      const updateResponse = await req.app.locals.elasticsearch.index({
        index: indexName,
        id: userProfileData.id,
        body: {
          accounts: updatedAccounts
        }
      }, (err, resp, status) => {
        console.log(resp);
      });

      console.log('User accounts created:', updateResponse);

    } else {
      // update existing data 

      // Update the accounts field
      const updateResponse = await req.app.locals.elasticsearch.update({
        index: indexName,
        id: userProfileData.id,
        body: {
          accounts: updatedAccounts
        }
      });
      console.log('User accounts updated:', updateResponse);

    }

    return true; // Return true if the update was successful
  } catch (error) {
    console.error('Error updating user accounts:', error);
    return false; // Handle the error or return false if the update fails
  }
}
async function getUserAccount(req, email) {
  try {
    const profile = await req.app.locals.elasticsearch.search({
      index: 'user_profile',
      body: {
        query: {
          match: { "accounts.email_address": email }
        }
      }
    });
    // Assuming the search results contain a single hit (user profile)
    return (profile.hits.hits.length > 0) ? profile.hits.hits[0]._source.accounts : null;

  } catch (error) {
    console.error('Error searching for user profile:', error);
    return false; // Handle the error or return false if the search fails
  }
}
module.exports = router;
