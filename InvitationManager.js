/*
 * Inviation Manager Independent Version
 */


window.addEventListener( "load", imSetup);


/*
 * First function called  
 */
function imSetup() {
	"use strict";

	// Document all main variables

	var debugMode, 		// If true, log console info
		surveyDB, 		// JSON var of data stored in im.json
		surveyScope, 	// Equals 1 if survey page and 2 is survey site
		dbURL, 			// location of im.xml, example "/content/dam/canada/json/im.json"

		// The following variables are used for debugging with query string
		overrideScope = false, 	// Query parameter sets this to a text value to force the scope (page or site)
		overrideStart = false, 	// Query parameter sets this to true to ignore the start date of surveys
		overrideID, 			// Query parameter sets this to an Id value for a specific survey	


		/*
		* Name of session storage values
		*/
		storageNames = {
			
			session: "im-settings"
		};

		//var dbURL = dbUrlFromJson();

	try { 
		
		// download the dbURL path

		if (!dbURL)
		{
			dbUrlFromJson();
			
			// asynchronous call
		}
		else {
			
			mainPart1();
		}		

	} catch (e) {
		return false;
	}
		
		
	/*
	 * main function Part One - setup the survey data
	 */
	function mainPart1 () {
		
		if (!dbURL) {
			return;
		}

		// Enable console logging if debug mode is turned on
		debugMode = checkEnableDebugMode();
		
		consoleLog("Start");

		// Check if any special parameters are used for testing reasons
		checkTestParams();
		
		consoleLog("Check Test Params");

		// If the user has not seen a survey
		if (!localStorage.getItem('lastDateIMShown')) {
			
			consoleLog("lastDateIMShown === null");

			// Check if DB is already in session storage
			surveyDB = JSON.parse(sessionStorage.getItem(storageNames.session));

			// Download the DB if it is not already stored 
			if (!surveyDB) {
				consoleLog("downloadSurveyDB");
				downloadSurveyDB();

				// Asynchronous call, do not execute code here
			}
			else {
				mainPart2();
			}
		}
		// Case when the user has already seen an invitation
		else {
			consoleLog("User has seen an invitation already");

			var	lastDateIMShown = new Date(localStorage.getItem("lastDateIMShown"));
			if (isStorageExpired(lastDateIMShown)) {
				localStorage.removeItem("lastDateIMShown");
				
				downloadSurveyDB(); 
				
				mainPart2();
			}
		
		}
		// Asynchronous call may have been made, do not execute code here

	}


	/*
	 * main function Part two - select the survey to display
	 */
	function mainPart2() {

		// Make sure the surveyDB object is set, it could not have been defined if 
		// localStorage was not defined and the json is unfound on the server
		if (!surveyDB || !surveyDB.settings)
		 return;

		// At this point, we don't know if it the was just downloaded or if it was 
		// retrieved from session storage
		
		// if the DB doesn't have a scopeHat, then we need to decide on which scope hat to give
		if (!surveyDB.settings.scopeHat) {
			firstTimeSetup();
		}

		// Check if we need to override the scope hat
		// This is needed since firstTimeSetup won't run if this is not the first page of the visit
		if (overrideScope) {
			surveyDB.settings.scopeHat = overrideScope;
		} 

		surveyScope = surveyDB.settings.scopeHat;
		consoleLog("Scope hat = " + surveyScope + ", " + surveyDB.surveys.length + " potential surveys, removing surveys outside of date range");
		
		// Delete all surveys that are outside of working dates
		var list = surveyDB.surveys;
		for (var i = 0; i < list.length; i++) {
			var n = new Date().getTime();
			var end_time = new Date(list[i].end_date_time).getTime();
			if (n < new Date(list[i].start_date_time).getTime() || 
				n >= end_time) {
				
				// If overriding start date and still before end date then don't delete this survey
				if (overrideStart && n < end_time) {
					continue;
				}
				
				// Splice removes the element from the array
				list.splice(i,1);

				//decrement i since the next record has moved to replace the current record
				i--;
			}
		}

		consoleLog(list.length + " potential surveys, removing surveys based on targeting");	

		surveyDB.surveys = list;

		// save the DB to session storage
		sessionStorage.setItem(storageNames.session, JSON.stringify(surveyDB));

		consoleLog("Checking whitelist");

		// Check if url on whitelist
		var list = getObjArr(surveyDB.settings.tbl_url_whitelist),
			a = document.location, 
			h = a.hostname + a.pathname, 
			didMatch = false;

		if ( !list ) {
			return false;
		}

		for (var i = 0; i < list.length; i++) {
			var b = new RegExp(list[i].url, "i");
			if (b.test(h))
				didMatch = true;
		}

		if ( !didMatch ) {
			return false;
		}
		
		consoleLog("Checking blacklist");

		// Check if url is on blacklist
		var list = getObjArr(surveyDB.settings.tbl_url_blacklist), 
			a = document.location, 
			h = a.hostname + a.pathname;

		for (var i = 0; i < list.length; i++) {
			var l = list[i].url;
			if (l !== undefined && l.length !== undefined) {
				if (l.toLowerCase() == h.toLowerCase()) {
					return false;
				}
			}
		}
		
		consoleLog("Removing surveys based on page attributes");

		// Make a deep copy of the survey DB before we remove the applicable surveys 
		// This is needed because getPageAttributeMatches will delete any survey that matches from the surveyDB list
		var cpySurveys = JSON.parse(JSON.stringify(surveyDB.surveys));
		
		// b will be the index of a survey in cpySurveys that was chosen otherwise 
		// it will be undefined if no survey was selected
		var b = getWeightedRandom(getPageAttributeMatches());

		if ( b ) {

			for (var j = 0; j < cpySurveys.length; j++) {

				if(cpySurveys[j].id === b){
                			var selectedSurveyIndex = j;
                			break;

				}
			}
			
			consoleLog("Select survey " + cpySurveys[selectedSurveyIndex].survey_name);

			// Show survey only if user hasn't seen it last 15 days
			var lastDateIMShown;
			var now = new Date();
			
			if ( localStorage.getItem( "lastDateIMShown" ) ) {
				lastDateIMShown = new Date(localStorage.getItem('lastDateIMShown'));
			}

			// Persistent cookie duration is the number of days of minimal interval between 2 surveys
			if (!isStorageExpired(lastDateIMShown)) {

				// Popup the survey
				invite(cpySurveys[selectedSurveyIndex]);

				//set the date visitor was invited
				localStorage.setItem('lastDateIMShown', now);
			}
		}
		else {
			consoleLog("No survey selected, " + surveyDB.surveys.length + " surveys remain in session storage");
			
			//save the updated DB to session storage
			//the DB must be saved here since we need to remove surveys that were applicable on this page so we don't test for them again in the visit
			sessionStorage.setItem(storageNames.session, JSON.stringify(surveyDB));
		}
		
	}

	/*
	 * Check if debug mode is enabled
	 */
	function checkEnableDebugMode() {
		
			//Set the local storage token to remember to log console info
		if (/[?&]logim=(true|1)/i.test(document.location.search))
			localStorage.setItem('imlog', 1);

		if (/[?&]logim=(false|0)/i.test(document.location.search))
			localStorage.removeItem('imlog');
		
		return (localStorage.getItem('imlog') == 1);
	}
	

	/*
	 * Log console data if debug mode is enabled
	 */
	function consoleLog (val) {
		if (debugMode) {
			console.log("Invitation Mgr: " + val);
		}
	}


	/*
	 * Check if any special parameters are used for testing reasons
	 */
	function checkTestParams() {
		// Process query parameters
		
		// Case of cookies
		if (/[?&]im_nocookiecheck=1/i.test(document.location.search)) {
			consoleLog("Treat visitor as new visitor (deleting locally stored data)");
			
			// Delete this cookie
			localStorage.removeItem( "lastDateIMShown" );
			
		}

		// Case of scope (page or site)
		if ( (/[?&]im_scope=page/i.test(document.location.search)))
			overrideScope = "Page";
		else if ( (/[?&]im_scope=site/i.test(document.location.search)))
			overrideScope = "Entire site";
		
		// Case of date
		if ( (/[?&]im_nodatecheck=1/i.test(document.location.search)))
			overrideStart = true;
		
		// Case of Survey Id
		var b = /[?&]im_surveyid=([^?&]+)/.exec(document.location.search);
		if (b !== null )
			overrideID = b[1];

	}


	/*
	* Load the survey from json file to storage
	*/
	function downloadSurveyDB() {

		$.getJSON(
		dbURL,
		function() {
			consoleLog("Get Json File is Successful");
		} )
		.done( function(result) {
			surveyDB = JSON.parse(JSON.stringify(result));
			mainPart2();
		} )
		.fail( function() {
			consoleLog( "Fail to get JSON File" );
		} )
		.always( function() {
			consoleLog( "JSON file Complete" );
		} );

	}


	/*
	 * Take a date object as parameter and test if the storage date is expired
	 */
	function isStorageExpired(storageDate) {
		var now = new Date();
		var maxNbDaysIMPersist = surveyDB.settings.persistent_cookie_duration;
		if ( ( ( now - storageDate ) <= ( maxNbDaysIMPersist * 86400000 ) ) || !storageDate ) {
			return false;
			
		}
		return true;
	}


	/*
	 * First time invitation setup. We need to allocate scope hat and remove
	 * surveys that don't match the scope hat
	 */
	function firstTimeSetup() {

		// tmpSurveyDB is where we will copy all the wanted data from surveyDB into
		// this removes non applicable scope surveys
		var tmpSurveyDB = {settings : {}, surveys : []};

		consoleLog("Rolling probability for scope hat");

		if (overrideScope)
		{
			surveyScope = overrideScope; // Page or Site
			consoleLog("surveyScope = overrideScope = " + overrideScope);
		}
		else
		{
			
			surveyScope = getWeightedRandom({"Page":surveyDB.settings.Page, "Entire site":surveyDB.settings.Site});
			
			consoleLog("surveyScope = getWeightedRandom = " + surveyScope);
		}
		
		// get an object array of all surveys in the DB
		var list = getObjArr (surveyDB.qry_active_surveys);

		consoleLog(list.length + " potential surveys, removing surveys that don't match scope hat");

		for (var i = 0; i < list.length; i++) {
			
			// Get only surveys that apply to this scope
			if (list[i].type == surveyScope) {
				
				// Copy good surveys to tmpSurveyDB
				tmpSurveyDB.surveys[tmpSurveyDB.surveys.length] = list[i];

			}
		}

		// Put all the needed settings into tmpSurveyDB
		tmpSurveyDB.settings.Page = surveyDB.settings.Page;
		tmpSurveyDB.settings.Site = surveyDB.settings.Site;
		tmpSurveyDB.settings.scopeHat = surveyScope;
		tmpSurveyDB.settings.tbl_url_whitelist = surveyDB.settings.tbl_url_whitelist;
		tmpSurveyDB.settings.tbl_url_blacklist = surveyDB.settings.tbl_url_blacklist;
		tmpSurveyDB.settings.persistent_cookie_duration = surveyDB.settings.persistent_cookie_duration;
		
		//set surveyDB to tmpSurveyDB so we can be sure that surveyDB is the good variable
		surveyDB = tmpSurveyDB;
		
	}


	/*
	 * Given a JSON array of values and probabilities, output the weighted random selection.
	 * For example {coffee: 0.20, tea: 0.80}
	 * Output nothing if no selection is made (I.E. undefined)
	 */
	function getWeightedRandom(spec) {
		
		var i, sum =0, r = Math.random();
		for (i in spec) {
			
			// be sure to never select something with 0% probability,
			// since Math.random() can be 0
			if (spec[i] === 0){
				continue;
			}

			sum += parseFloat(spec[i]); //Number(spec[i]);
			if (r <= sum)
				return i;
		}

	} 

	/*
	 * return an object array containing the given parameter.
	 * This allows us to loop through the object array whether there are 0, 1 or more objects in the array
	 */
	function getObjArr(o){
		
		if (!o) {
			return [];
		}
		else if (Array.isArray(o)) {
			return o;
		}
		else {
			return [o];
		}
		
	}


	/*
	 * Return a list of valid surveys based on page or site
	 */
	function getPageAttributeMatches() {

		// Return list of valid surveys based on page / site and check if override survey id needed

		// Remove surveys that are valid from the surveyDB array so that when we save it, 
		// those ones are removed and not tested on future pages in the visit
		
    	var surveySubList = {};
		var url = document.location.hostname + document.location.pathname;
		var count = 0;
		
		for (var i = 0; i < surveyDB.surveys.length; i++) {
			
			var survey_i = surveyDB.surveys[i];
			
			if (overrideID) {
				
				// Skip this loop's logic if it's not the desired survey, 
				// therefore there's no chance it will be selected
				if (survey_i.id !== overrideID){
				
					continue;
				}  

				// If it is the desired survey, set it's probability to 100%. 
				// Note that the desired survey must still be applicable on this page 
				// so the logic in the swtich statement still must execute meet the conditions
				survey_i.probability = 100;
			}
			
			switch(survey_i.type) {

				case "Entire site":
				
					// Get an object array of the sites to run the survey on
					var sublist = getObjArr(survey_i.tbl_survey_sites);
					
					for (var c = 0; c < sublist.length; c++) {
						
						//convert the value for the site into RegExp non-case sensitive
						var b = new RegExp(sublist[c].site, "i");
						
						//if the url matches the regEx
						if (b.test(url)) {
							
							// Store this survey's id and probability in the new object 
							// (this object is later fed to getWeightedRandom)

							// Convert site survey probability into rate since it is 
							// between 0 and Visitor Allocation for site wide type
						
							surveySubList[survey_i.id] = 
								survey_i.probability * surveyDB.settings.Site;

							// Keep track of the number of surveys that apply so we can 
							// console log it later
							count++;

							// Remove this survey from the DB, since we won't test for it on future pages
							surveyDB.surveys.splice(i,1);
							
							// Decrement i since the next record has moved to replace the current record
							i--;
						}
					}
					
					break;
				
					
				case "Page":

					var sublist = getObjArr(survey_i.tbl_survey_urls);
					
					var wLocation = window.location.href.toLowerCase();

					for (var c = 0; c < sublist.length; c++) {

						if (wLocation.indexOf(sublist[c].url.toLowerCase()) !== -1 && i>=0) {
							surveySubList[survey_i.id] = survey_i.probability * surveyDB.settings.Page;
							count++;
							
							// Remove the eligible survey from the DB, since we won't test for it on future pages
							surveyDB.surveys.splice(i,1);

							// Decrement i since the next record has moved to replace the current record
							i--;
						}
					}
					
					break;
			}		
		}
		
		consoleLog(count + " potential surveys, selecting a survey");
	
		return surveySubList;
	}


	/*
	 * Display the popup given the survey parameters
	 */
	function invite(survey) {	
	
		var html =  
		"<aside id='gc-im-popup' class='asideBody wb-overlay modal-content overlay-def wb-popup-mid shadow'>" +
			"<header class='modal-header'>" +
				"<div class='modal-title'>" + survey["title-" + wb.lang] + 
					"<button type='button' class='overlaydef closeIcon zoomX' aria-label='Close'><span aria-hidden='true' >&times;</span></button>" +
				"</div>" + // for the close icon
			"</header>" +
			"<div class='modal-body'>" +
				survey["body-" + wb.lang] +
				"<ul class='list-inline mrgn-tp-md'>" +
					"<li class='mrgn-tp-md marginBottom-yes'><a id='survey-yes' class='gc-im-btn gc-im-btn-primary' href='" + survey["link-" + wb.lang] + "' target='_blank'>" + survey["yes-" + wb.lang] + "</a></li> " + 
					"<li class='mrgn-tp-md marginBottom-no'><button id='survey-no' class='gc-im-btn gc-im-btn-secondary survey-close'>" + survey["no-" + wb.lang] + "</button></li>" +
				"</ul>" +
				"<input type='hidden' name='popupName' value='" + survey["uniqueTitle"] + "'>" +
			"</div>" +
			"<div class='modal-footer  hidden'>" +
		
			"</div>" +
		"</aside>",
		
		$html = $( html ),
		$userFocus = true,
		overlayIsClosing,
		focusFlag;

		// Close the overlay if any of its links/buttons get clicked or if the escape key gets pressed.
		$html.bind( "click vclick mouseup keydown", function( e ) {	
	  	// Proceed if any of the overlay's links or buttons get clicked (including middle mouse clicks) 
		// or if the escape key gets pressed within the overlay. 
	  	if (
		  ( ( e.type === "click" || e.type === "vclick" ) && e.which === 1 && $( e.target ).closest( "a, button", this ).length ) // Clicked/Tapped a link/button.
		  ||
		  ( e.type === "mouseup" && e.which === 2 && $( e.target ).closest( "a", this ).length ) // Middle-clicked a link.
		  ||
		  ( ( e.type === "keydown" ) && ( e.which === 27 ) ) // Pressed escape key.
		) {
		
		
			// add to remove added classes to overlay when closing
			$html
					.removeClass( "open" )
					.attr( "aria-hidden", "true" );
					
		  	// Set a flag to indicate the overlay is closing.
		  	// Needed to prevent IE11 (possibly also IE8-10/Edge) from failing to return 
			// user focus when closing the overlay (due to a separate focusin event triggering 
			// too quickly and clearing the user focus variable before it's needed).
		  	overlayIsClosing = 1;
		  
		  	// Hide the overlay immediately.			
		  	$( this ).hide();
		  
		  	// Remove the overlay shortly afterwards.
		  	// This is being done to prevent problems when the yes link is middle-clicked. If the overlay were to be immediately removed, middle-clicking the yes link would remove the overlay without opening the link in a new tab/window. To avoid that issue, the overlay is now getting immediately hidden, then removed a short time later.
		  	setTimeout( function() { $html.empty() }, 1000 );
		  

		  	// Return the user's focus to where they were before the overlay stole it, then delete the user focus variable.
		  	// Otherwise, return the user's focus to the H1 element (or if it doesn't exist - the next element, which is likely to be main). Needed to prevent browsers from unexpectedly returning focus to the top of the page.
		  	if ( $userFocus ) {
				$userFocus.trigger( "setfocus.wb" );
				$userFocus = null;
		  	}
		  	else {
		  
				// Does the H1 exist? If yes, focus to it.
				// Otherwise, focus to whatever element comes after the overlay (likely main).
				if ( $( "h1" ).length ) {
			  		$( "h1" ).trigger( "setfocus.wb" );
				}
				else {
			  		$html.next().trigger( "setfocus.wb" );
				}
		    }
		  
			
			// Remove this event handler.
			$( this ).off();
	  	}
		} );
	

	
		// If the user tabs out of the overlay after it was automatically focused on, return their initial focus.
		$html.find( ".wb-overlay" ).on( "keydown", function( e ) {
			
	  		// Proceed if tabbing backwards from the panel container/yes link or if tabbing forward from the close button.
	  		if ( ( ( ( $( e.target ).hasClass( "wb-overlay" ) || e.target.id === "survey-yes" ) && e.shiftKey) 
				|| e.target.id === "survey-close" ) && e.which === 9 && $userFocus ) {
		  
		  		// Don't focus to whatever comes directly before or after the overlay in the flow of content.
		  		e.preventDefault();
		  
		  		// Return the user's focus to where they were before the overlay stole it, 
				// then delete the user focus variable.
		  		$userFocus.trigger( "setfocus.wb" );
		  		$userFocus = null;
		  
		  		// Remove this event handler.
		  		$( this ).off( "keydown" );
			}
		} );
		
		
		// Insert the overlay directly before the <main> element.
		$( "main" ).before( $html );
		
		// trigger the init and open event of the overlay
		$( "#gc-im-popup" ).trigger( "wb-init.wb-overlay" );
		$( "#gc-im-popup" ).trigger( "open.wb-overlay" );
		

		// Find where the user is currently focused.
		$userFocus = $( document.activeElement );
	
		// Automatically focus on the overlay.
		$html.find( ".wb-overlay" ).trigger( "setfocus.wb" );
	
		// After the overlay steals focus, clear the user focus variable if the user goes outside of of it.
		// It's possible to go outside of the overlay without closing or tabbing out of it 
		// (e.g. by clicking or touching outside of it or using a screen reader to navigate by links). 
		// In that scenario, the user focus variable needs to be cleared to prevent strange focusing 
		// if the user enters the overlay again afterwards and focuses out of/closes it.
		$( "body" ).on( "focusin mousedown", function ( e ) {
	
	  	// When the survey overlay first gains focus, set the focus flag variable to 1. 
		// Sometimes the overlay isn't the first thing that gains focus.

	  	// After the overlay has initially gained focus, once something outside of it gets focused on, 
		// clear the user focus variable. If the overlay is losing focus because it's being closed, 
		// don't do anything or else IE11 (possibly also IE8-10/Edge) will run this event handler too early 
		// and prevent the close event from returning user's focus to the right spot.
	  	if ( $( e.target ).closest( ".wb-overlay", this ).length ) {
		
			if ( ! focusFlag ) {
		  		focusFlag = 1;
			}
	  	}
	  	else {
	  
			if ( ! overlayIsClosing && $userFocus ) {
		  		$userFocus = null;
			}
	  	}

		
		} );

		// Correct popup positionning 0n load, on resize an on Y scroll if necessary
		$( window ).on( "resize scroll", function() {
			
			// Equals to popup default bottom value in CSS
			var bottomY = 25;
			var $footer = $( "#wb-info" );

			if ( $( window ).scrollTop() >= $( document ).outerHeight() - $( window ).outerHeight() - $footer.outerHeight() ) {
					$html.css( {
						bottom: ( $footer.outerHeight() - ( $( document ).outerHeight() - $( window ).outerHeight() - $( window ).scrollTop() ) + bottomY )
					} );
				} else {
					$html.css( {
						bottom: bottomY
					} );
				}
		} );
		
  	}

	/*
	* get the dbURL path from the config.json file
	*/
	function dbUrlFromJson() {
		
		$.getJSON(
			"/invitation-manager/config.JSON",
			function() {
				consoleLog("Get Config File Path is Successful");
			})
			.done( function (result) {
				var myConfig = JSON.parse( JSON.stringify( result ) );;
        		dbURL = myConfig.dbURL;
				if (dbURL) {
					mainPart1();
				}
				else {
					return;
				}
			})
			.fail( function() {
				consoleLog("Get Config File Path Failed");
			})
			.always( function() {
				consoleLog("Get Config File Path is Completed");
			});
				   		
	}

	
}
