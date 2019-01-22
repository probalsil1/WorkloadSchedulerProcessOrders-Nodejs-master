/*********************************************************************
 *
 * Licensed Materials - Property of IBM
 * Product ID = 5698-WSH
 *
 * Copyright IBM Corp. 2015. All Rights Reserved.
 *
 ********************************************************************/ 

function doAction () {		
	 jQuery.ajax({ 
		 type: "PUT",
		 dataType: "json",
		 url: getUrl + addParam,
		 async: asyncParam,
		 success: function(data){  
			 return data;
		 },
		 error: function (error) {
			return {successful: false};
		 }
	});
}

$(document).ready(function() {
	
	/* 3 index of aaSorting param is related to 'Start Date' column */
    $('#datatable').DataTable({
		"aaSorting": [[3,'desc']]
	});
	
	
	/* Reload button needs to be injected after the initialization of datatable element
	*  We can't add the button to the dom before this step because is currently displayed on the right of the search button
	*  Search button is a dom element created by DataTable
	*/
	jQuery("#datatable_filter").append(jQuery('<button type="button" class="btn btn-primary reload-button" onclick="selectMonitoring()">Reload</button>'));
	
	connectSubmitKeyHandler();
} );

function connectSubmitKeyHandler () {
	var fields = jQuery("#provisioning-container input");
	
	fields.keypress(function (e) {
		if (e.which == 13) {
			jQuery("#submitButton").click();
		}
	});
	
}

function selectMonitoring () {
	console.info("selectMonitoring");
	jQuery("#monitoring-container").css("display", "block");
	jQuery("#provisioning-container").css("display", "none");
	jQuery(".submit-button-container").css("display", "none");
	
	jQuery("#monitoringButton").addClass("active");
	jQuery("#provisioningButton").removeClass("active");
	
	getRequestList();
}

function selectProvisioning () {
	console.info("selectProvisioning");
	jQuery("#monitoring-container").css("display", "none");
	jQuery("#provisioning-container").css("display", "block");
	jQuery("#monitoringButton").removeClass("active");
	jQuery("#provisioningButton").addClass("active");
	jQuery(".submit-button-container").css("display", "block");
}

function submitRequest() {
	var data = {
		email: jQuery("#email").val(),
		emailSubject: jQuery("#emailSubject").val(),
		emailBody: jQuery("#emailBody").val()
	};
	showLoadingMessage("#loadingSubmitDiv");
	jQuery.ajax({ 
		 type: "POST",
		 //dataType: "json",
		 url: "/api/submissions",
	     contentType: 'application/json',
	     data: JSON.stringify(data),
		 success: function(data){
			 hideLoadingMessage("#loadingSubmitDiv");
			 jQuery('#actionSubmitted').modal('show');
			 jQuery("#provisioning-container input").blur();
			 return data;
		 },
		 error: function (error) {
			hideLoadingMessage("#loadingSubmitDiv");

		 	alert("Error during the submission");
			return {successful: false};
		 }
	});
}

function getRequestList() {
	showLoadingMessage("#loadingDiv");
	jQuery.ajax({ 
		 type: "GET",
		 //dataType: "json",
		 url: "/api/submissions",
	     contentType: 'application/json',
		 success: function(data){
			 console.log('Populating table...');
		 	 hideLoadingMessage("#loadingDiv");
		 	 console.info(data);
		 	 populateTable(data);
		 	 
			 return data;
		 },
		 error: function (error) {
		 	hideLoadingMessage("#loadingDiv");
		 	alert("Error during the monitoring request");
			return {successful: false};
		 }
	});
}

function populateTable(data) {
	var dataTable = jQuery("#datatable").DataTable();
	dataTable.clear().draw();
	for (var i=0; i<data.length; i++) {
		var sub = data[i];
		
		dataTable.row.add([
			escapeHTML(sub.email),
			escapeHTML(sub.emailSubject),
			escapeHTML(sub.status),
			escapeHTML(sub.start)
		]);
	}
	dataTable.draw();
}

function escapeHTML(str) {
	if (str.replace) {
		return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	} else {
		return str;
	}
}

function showLoadingMessage(id) {
	var loading = jQuery(id);
	loading.removeClass("loading-hide");
	loading.addClass("loading-show");
}

function hideLoadingMessage(id) {
	var loading = jQuery(id);
	loading.removeClass("loading-show");
	loading.addClass("loading-hide");
}
