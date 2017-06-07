const Bot = require('./lib/Bot')
const SOFA = require('sofa-js')
const Fiat = require('./lib/Fiat')
const request = require('request')
const unit = require('ethjs-unit')


const SITE = "stackapps"
let bot = new Bot()

// ROUTING

bot.onEvent = function(session, message) {
  console.log(session.get('state'))
  switch (message.type) {
    case 'Init':
      welcome(session)
      break
    case 'Message':
      parseMessage(session, message)
      break
    case 'Command':
      parseCommand(session, message)
      break
    case 'Payment':
      onPayment(session, message)
      break
    case 'PaymentRequest':
      welcome(session)
      break
  }
}


function welcome(session){
    sendMessage(session, "This is a bot that allows you to get your questions on StackOverflow solved under tight time constraints for a small price.\n\nIf you are an expert, this is a great place to monetize your expertise!")
}


function onPayment(session, message) {
  if (message.fromAddress == session.config.paymentAddress) {
    // handle payments sent by the bot
    if (message.status == 'confirmed') {
      // perform special action once the payment has been confirmed
      // on the network
    } else if (message.status == 'error') {
      // oops, something went wrong with a payment we tried to send!
    }
  } else {
    // handle payments sent to the bot
    if (message.status == 'unconfirmed') {
      session.set('state','block')
      //let transaction = JSON.parse(message)
      // payment has been sent to the ethereum network, but is not yet confirmed
      sendMessage(session, "Thanks for the payment! Once the transaction is confirmed, we will forward the question to " + session.get("answeruser") + ". This should take a few seconds.");
    } else if (message.status == 'confirmed') {
      sendMessage(session, "Payment has been confirmed");
      //sendMessage(session, JSON.stringify(message))
      
      processPayment(session, message["value"],'ether')
      session.set('state','new')
      // handle when the payment is actually confirmed!
    } else if (message.status == 'error') {
      sendMessage(session, "There was an error with your payment! \n\nPlease re-post your question.");
      session.set('state','new')
    }
  }
}

// STATES

function parseCommand(session, command){

/*  if(command.content.value === "terminate"){
    session.set('state','new')
    sendMessage(session, "Transaction in process, please maintain silence")
    return
  }
*/
  if(command.content.value === "block"){
      let controls = [
        {type: 'button', label: 'Terminate', value: 'terminate'}
      ]
      sendCustomControlsMessage(session, "A transaction is in process. Please maintain silence", controls)
  }

  if(command.content.value === 'help'){
      processHelp(session)
      return;
  }
  if(command.content.value === "register"){
    session.set('state', 'expectingaccesstoken')
    processRegister(session)
    return;
  }
  if(command.content.value === "requests"){
    session.set('state','expectingquestion')
    processRequests(session)
    return
  }
  if(command.content.value === "questions"){
    processQuestions(session)
    return
  }
  if(command.content.value === "whoami"){
    processWhoAmI(session)
  }
  if(command.content.value.startsWith("cancel ")){
    sendMessage(session, command.content.value)
    let vals = command.content.value.split(" ")
    processCancel(session, vals[1], vals[2])
    return
  }
  if(command.content.value.startsWith("answer ")){
    sendMessage(session, command.content.value)
    let vals = command.content.value.split(" ")
    processAnswer(session, vals[1], vals[2])
    return
  }
  if(session.get('state') === 'expectinguser'){
    processUser(session, command.content.value)
  }
  if(session.get('state') === 'expectingtime'){
    processTime(session, command.content.value)
  }
}

function parseMessage(session, message){

/*  if(command.content.value === "block"){
      let controls = [
        {type: 'button', label: 'Terminate', value: 'terminate'}
      ]
      sendCustomControlsMessage(session, "A transaction is in process. Please maintain silence", controls)
  }
*/



    if(message.body === "Help" || message.body === "help"){
        sendMessage(session, "Do you want help?")
        return
    }
    if(message.body === "test"){
        console.log("Hello")
	sendMessage(session, "y")
        //processPayment(session, "0x173a595fe9c00")
	//session.set("user_id","46580")
        return
    }

    if(message.body.startsWith("https://"+SITE+".com/questions/")){
        session.set('state','newquestion')
        let re = new RegExp("https\:\/\/"+SITE+"\.com\/questions\/(\\d*)")
        let found = message.body.match(re)
        if(!found){
            sendMessage(session, "Please give a valid url to a question you posted on "+SITE)
        }
        session.set('questionid', found[1])
        let stackUri = "http://api.stackexchange.com/2.2/questions/"+found[1]+"?order=desc&sort=activity&site="+SITE
        request(
           { method: 'GET', 
             uri: stackUri,
             gzip: true
           },
           function(err, response, body){
             let responseJson = JSON.parse(body)
             let tags = responseJson["items"][0]["tags"]
             let topUsers = {}
             let intersection = {}
             let allUsers = {}
             for(i = 0 ; i < tags.length ; i++){
               let tag = tags[i];
               let stackTopAnswersUri = "https://api.stackexchange.com/2.2/tags/"+tag+"/top-answerers/all_time?site="+SITE
               request({
                 method : 'GET',
                 uri : stackTopAnswersUri,
                 gzip : true
               }, function(tagsErr, tagsResponse, tagsBody){
                 if(tagsErr) { sendMessage("Unable to fetch users for "+ tag); return}
                 topUsers[tag] = JSON.parse(tagsBody)["items"]           
                 for( j = 0 ; j < topUsers[tag].length ; j++){
                    
                     allUsers[topUsers[tag][j]["user"]["user_id"]] = topUsers[tag][j]["user"]
                     if(intersection[topUsers[tag][j]["user"]["user_id"]]){
                        intersection[topUsers[tag][j]["user"]["user_id"]] = intersection[topUsers[tag][j]["user"]["user_id"]] + 1
                     }
                     else{
                       intersection[topUsers[tag][j]["user"]["user_id"]] = 1
                     }
                        
                 }
                 if(tag === tags[tags.length - 1]){
                     let sortable = Object.keys(intersection).map(function(key) {
                       return [key, intersection[key]];
                     });
                     sortable.sort(function(first, second){
                       if(first[1] == second[1])
                           return allUsers[second[0]]["reputation"] - allUsers[first[0]]["reputation"]
                       return second[1] - first[1]
                     });
                     let controls = []
                     for(sortableIter = 0; sortableIter < sortable.length; sortableIter++){
                         if(sortableIter == 15) break
                         controls.push(
                              {type: 'button', label: allUsers[sortable[sortableIter][0]]["display_name"] + " ("+allUsers[sortable[sortableIter][0]]["reputation"]+")", value: "" + sortable[sortableIter][0]})
                     }

                     session.set('state', 'expectinguser')
                     session.set('usersuggestioncontrol',controls)
                     sendCustomControlsMessage(session, "Whom do you want to direct the question to?[select from list or enter username of SO user]", controls);
                 }
               })
               
             }
           } 
        )
        sendMessage(session, stackUri)
        return 
    }
    if(session.get('state') === 'expectinguser'){
        processUser(session, message.body)
        return
    }
    if(session.get('state') === 'expectingtime'){
        processTime(session, message.body)
        return
    }
    if(session.get('state') === 'expectingaccesstoken'){
        processAccessToken(session, message.body.trim())
        return;
    }
    if(session.get('state') === 'expectinganswer'){
        processMessageAnswer(session, message.body)
    }
/*    if(session.get('state') === "test"){
sendMessage(session, "testing")
var request = require("request");

var options = { 
  method: 'POST',
  url: 'https://api.stackexchange.com/2.2/questions/7410/answers/add',
  gzip : true,
  headers: 
   { 
//'postman-token': '94839733-5068-e64d-87e9-f6531972b4a1',
//     'cache-control': 'no-cache',
//     'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'},
  formData: 
   { access_token: 'N3A4HwZI*lmSkR27djsImQ))',
     key: '0KebtU7OXHfodLlXQtpguQ((',
     site: 'stackapps',
     body: 'This is the most amazing part because node JS is absolutely awesome and the scripts it provides.' } };

request(options, function (error, response, body) {
  sendMessage(session, body);
  sendMessage(session, JSON.stringify(response))
  sendMessage(session, JSON.stringify(error))
});


sendMessage(session, "testing end")






    }
*/
    welcome(session)

}

function contactUser(userId, amount){

}

function getQuestionName(questionId, callback){
    let stackUserUri = "https://api.stackexchange.com/2.2/questions/"+questionId+"?order=desc&sort=activity&site="+SITE+"&key=0KebtU7OXHfodLlXQtpguQ(("
  request({
      method: 'GET',
      uri : stackUserUri,
      gzip: true
    }, function (err, response, body){
        let responseJson = JSON.parse(body)
	if(responseJson.hasOwnProperty("items")){
	    if(responseJson["items"].length > 0){
	        callback(responseJson["items"][0]["title"])            
	    }
	}
    })
 

}


function processMessageAnswer(session, message){
    var options = { method: 'POST',
  url: 'https://api.stackexchange.com/2.2/questions/'+session.get('answering')+'/answers/add',
  gzip : true,
  headers: 
   { 'postman-token': '0f620726-5cd8-aabf-3a02-8ec586ad2c77',
     'cache-control': 'no-cache',
     'content-type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW' },
  formData: 
   { access_token: session.get('access_token'),
     key: '0KebtU7OXHfodLlXQtpguQ((',
     site: SITE,
     body: message } };
request(options, function (error, response, body) {
    let responseJson = JSON.parse(body)
    if(responseJson.hasOwnProperty("error_message")){
        sendMessage(session, responseJson["error_message"])
	return
    }
    bot.client.store.getKey("token_"+session.get("answeringquestionof")).then((token)=>{
	bot.client.send(token, "Your question has been answered \n\nhttps://"+SITE+".com/questions/"+session.get('answering') )
    })

    let newRequests = []
    bot.client.store.getKey(session.get("user_id")+"_requests").then((requestsRaw) => {
      let requests = JSON.parse(requestsRaw)
      for(i = 0 ; i < requests.length ; i++){
          let r = requests[i];
	  sendMessage(session , JSON.stringify(r))
	  sendMessage(session, session.get('answering'))
	  sendMessage(session, session.get('answeringquestionof'))
	  if(r["asker"] == session.get("answeringquestionof") && r["questionid"] == session.get("answering")){
	      sendMessage(session, "Yay you earned "+r["amount"].toString() + ". It should reflect in your balance soon!")
	      session.sendEth(r["amount"], function(session, error, result) {
                  console.log(error)
		  console.log(JSON.stringify(result))
              });

	  }
	  else{
	      newRequests.push(r)
	  }
      }
      bot.client.store.setKey(session.get('user_id')+"_requests", JSON.stringify(newRequests))
      session.set('answering','none')
      session.set('answeringquestionof','none')
      session.set('state', 'new')

    });

    sendMessage(session, "Yay, posted :) You will recieve your bounty shortly!")
});

}

function processAnswer(session, askerUserId, questionId){
    session.set('answering',questionId)
    session.set('answeringquestionof', askerUserId)
    sendMessage(session, "The next message you post here will be taken as answer to \n\n https://"+SITE+".com/questions/"+questionId+"\n\n And the answer will be posted automatically from your profile")
    session.set('state','expectinganswer')
}

function processCancel(session, cancelAnswerUserId, cancelQuestionId){
  sendMessage(session, "Attempting to cancel "+cancelQuestionId +" which was asked to "+cancelAnswerUserId)
  bot.client.store.getKey(session.get('user_id')+"_questions").then((questions) => {
    if(questions){
      let allQuestions = JSON.parse(questions)
      let newQuestions = []
      let hasCancelled = false
      for(i = 0 ; i < allQuestions.length; i++){ 
        if(allQuestions[i]["isAnswered"] == false && allQuestions[i]["answerer"] && allQuestions[i]["questionid"]){
	    hasCancelled = true
	}
	else{
            newQuestions.push(allQuestions[i])
	}
      }
      if(hasCancelled)
	    sendMessage(session, "Question successfully cancelled")
      bot.client.store.setKey(session.get('user_id')+"_questions", JSON.stringify(newQuestions))
    }
    else{
        sendMessage(session, "Something went wrong")
    }
  })

}

function processWhoAmI(session){
    sendMessage(session , "User ID " + session.get('user_id'))
    sendMessage(session, "Access token "+session.get('access_token'))
    bot.client.store.getKey("token_"+session.get("user_id")).then((token)=>{
        sendMessage(session, "Token " + token)
    })
    bot.client.store.getKey("payment_"+session.get("user_id")).then((payment)=>{
        sendMessage(session, "Payment " + payment)
    })
}

function processRequests(session){
  sendMessage(session, "Fetching your questions. Please wait")
  bot.client.store.getKey(session.get('user_id')+"_requests").then((questions) => {
    if(questions){
      let allQuestions = JSON.parse(questions)
      let controls = []
      for( i = 0 ; i < allQuestions.length; i++){
          let question = allQuestions[i]
    	      questionControl =    {
                  type: "group",
                  label: question["amount"],
                  "controls": [
                      {type: "button", label: "View Question", action: "Webview::http://madhavanmalolan.com"},
                      {type: "button", label: "Answer Question", value: "answer "+ question["asker"]+" " +question["questionid"]}
                  ]
              }
	      controls.push(questionControl)

      }
      sendCustomControlsMessage(session, "You have asked the following"+allQuestions.length.toString()+" questions", controls)
      
    }
    else{
        sendMessage(session, "You have not asked any questions yet. Copy paste a "+SITE+".com URL here to get started!")
    }
  });
}


function processQuestions(session){
  sendMessage(session, "Fetching your questions. Please wait")
  bot.client.store.getKey(session.get('user_id')+"_questions").then((questions) => {
    if(questions){
      let allQuestions = JSON.parse(questions)
      let controls = []
      for( i = 0 ; i < allQuestions.length; i++){
          let question = allQuestions[i]
	  //getQuestionName(question["questionid"], function(name){
	  if(question["answerer"]){
    	      questionControl =    {
                  type: "group",
                  label: question["amount"],
                  "controls": [
                      {type: "button", label: "View Question", action: "Webview::http://madhavanmalolan.com"},
                      {type: "button", label: "Cancel Question", value: "cancel "+ question["answerer"]+" " +question["questionid"]}
                  ]
              }
	      controls.push(questionControl)
	  }
	      //if(question["answeruser_id"] == allQuestions[i]["answeruser_id"] && question["questionid"]== allQuestions[i]["questionid"]){
	      
	      //}

	  //});

      }
      sendCustomControlsMessage(session, "You have asked the following questions", controls)
      
    }
    else{
        sendMessage(session, "You have not asked any questions yet. Copy paste a "+SITE+".com URL here to get started!")
    }
  });
}

function processAccessToken(session, accessToken){
    sendMessage(session, "Validating "+accessToken);
    let stackUserUri = "https://api.stackexchange.com/2.2/me?site="+SITE+"&access_token="+accessToken+"&key=0KebtU7OXHfodLlXQtpguQ(("
  request({
      method: 'GET',
      uri : stackUserUri,
      gzip: true
    }, function (err, response, body){
        sendMessage(session, body)
        let responseJson = JSON.parse(body);
        if(responseJson.hasOwnProperty("items")){
        if(responseJson["items"].length > 0){
            session.set('user_id', responseJson["items"][0]["user_id"].toString())
            session.set('state','none')
	    bot.client.store.setKey("token_"+responseJson["items"][0]["user_id"], session.get('tokenId'))
	    bot.client.store.setKey("payment_"+responseJson["items"][0]["user_id"], session.get('paymentAddress'))
            session.set('access_token', accessToken)
            return;
        }
        }
        sendMessage(session, "Authentication Failed. Please try again");
    })

}


function processPayment(session, amount){
   bot.client.store.getKey(session.get('user_id')+"_questions").then((confirmedQuestionsRaw)=>{
sendMessage(session, confirmedQuestionsRaw )
   let confirmedQuestions = []
   if(confirmedQuestionsRaw){
     confirmedQuestions = JSON.parse(confirmedQuestionsRaw)
   }   
   confirmedQuestions.push({questionid : session.get('questionid'), answerer : session.get('answeruser_id'), isAnswered: false, amount : unit.fromWei(amount, 'ether')})
   bot.client.store.setKey(session.get('user_id') + "_questions" , JSON.stringify(confirmedQuestions))

   let askedQuestions = []
   bot.client.store.getKey(session.get('answeruser_id') + "_requests").then((pendingRequests) => {
     let requests = []
     if(pendingRequests){
         requests = JSON.parse(pendingRequests)
     }
     requests.push({questionid : session.get('questionid'), asker: session.get('user_id'), amount : unit.fromWei(amount, 'ether')})
     bot.client.store.setKey(session.get('answeruser_id')+"_requests", JSON.stringify(requests))
     contactUser(session.get('answeruser_id'),unit.fromWei(amount, 'ether'))
   })
})

   sendMessage(session, "You have confirmed a ether bounty question to "+session.get('answeruser') + " with "+unit.fromWei(amount, 'ether') + " ethers. We hope you get a response soon!")    

}

function processRegister(session){
    sendMessage(session, "Tap on the following link. You will then be taken to StackOverflow. Login with your credentials. On successful login you would be shown a code. Please copy paste the code here. \n\nhttps://stackexchange.com/oauth/dialog?client_id=10013&scope=write_access,no_expiry&redirect_uri=http://madhavanmalolan.com/token-so/oauth")
}

function processHelp(session){
    let helpControls = [
      {type: 'button', label: 'Login with your StackOverflow Account', value: 'register'},
      {type: 'button', label: 'Who Am I', value: 'whoami'},
      {type: 'button', label: 'Ask a question with a cash bounty', value: 'post'},
      {type: 'button', label: 'Questions that i have asked', value: 'questions'},
      {type: 'button', label: 'Questions that i have been asked', value: 'requests'}
    ]
    sendCustomControlsMessage(session, "How can I help you today?", helpControls)
}

function processTime(session, time){
    sendMessage(session, time)
    let timeHrs = parseInt(time)
    if(isNaN(timeHrs)){
        sendMessage(session, "Please enter integral number of hours")
       return 
    }
    session.set('state', 'expectingpayment')
    sendMessage(session, timeHrs)
    sendMessage(session, "Please pay using the 'Pay' option on your Token browser, the amount you'd like to transfer to "+session.get('answeruser') +". This amount will be paid only if you get a response within the time period you have set, else you will get your money back!")
}


function processUser(session, userid){
    let stackUserUri = "https://api.stackexchange.com/2.2/users/"+userid+"?site="+SITE
    request({
      method: 'GET',
      uri : stackUserUri,
      gzip : true
    }, function (err, response, body){
      responseJson = JSON.parse(body)
      if(responseJson["items"].length ==0 ){
          sendCustomControlsMessage(session, "Please enter a valid userid", session.get('usersuggestioncontrol'))
          return
      }
      user = responseJson["items"][0]
      session.set('answeruser', user['display_name'])
      session.set('answeruser_id', userid)
      session.set('state','expectingtime')
    let timeControls = [
      {type: 'button', label: '1 hr', value: '1'}    ,
      {type: 'button', label: '5 hr', value: '5'}    ,
      {type: 'button', label: '1 day', value: '24'}    ,
      {type: 'button', label: '5 days', value: '120'}    ,
      {type: 'button', label: '10 days', value: '240'}    ,
      {type: 'button', label: '15 days', value: '360'}    ,
    ]
    sendCustomControlsMessage(session, "In how much time do you need your answer? Select an option or type in the number of hours you are willing to wait", timeControls)
    })
}

function pong(session) {
  sendMessage(session, `Pong`)
}

// example of how to store state on each user
function count(session) {
  let count = (session.get('count') || 0) + 1
  session.set('count', count)
  sendMessage(session, `${count}`)
}

function donate(session) {
  // request $1 USD at current exchange rates
  //Fiat.fetch().then((toEth) => {
  //  session.requestEth(toEth.USD(0.1))
  //})
  session.requestEth(0.001, "bribe me")
}

// HELPERS

function sendMessage(session, message) {
  let controls = [
    {type: 'button', label: 'Help', value: 'help'}
  ]
  session.reply(SOFA.Message({
    body: message,
    controls: controls,
    showKeyboard: false,
  }))
}

function sendCustomControlsMessage(session, message, controls){
  session.reply(SOFA.Message({
    body: message,
    controls: controls,
    showKeyboard: false,
  }))
}
