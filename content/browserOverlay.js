//Set up a unique namespace.
if (!GMusicMediaFix) var GMusicMediaFix = {};

//Load the C hotkeys.dll library and set it up so we can use its functions.
if (!GMusicMediaFix.HotkeyLib) GMusicMediaFix.HotkeyLib = {
  libC: null,

  hotkeyIntervalID: 0,

  tabWatchIntervalID: 0,

  init: function () {
    if (GMusicMediaFix.HotkeyLib.libC == null) {
      //Load the DLL.
      Components.utils["import"]("resource://gre/modules/ctypes.jsm");

      var profileDir = Components.classes[
        "@mozilla.org/file/directory_service;1"].getService(Components.interfaces
        .nsIProperties).get("ProfD", Components.interfaces.nsIFile).path;
      var dllPath = profileDir +
        "/extensions/{cad52e60-d607-11e2-8b8b-0800200c9a66}/resource/hotkeys.dll";

      GMusicMediaFix.HotkeyLib.libC = ctypes.open(dllPath);

      //Set up the DLL's init function.
      var dllInit = GMusicMediaFix.HotkeyLib.libC.declare("init", //C function name
        ctypes.default_abi, //Default call ABI
        ctypes.void_t //C function return type
      );

      //Run the DLL's init function.
      if (dllInit != null) {
        dllInit();
      }

      //Set up the DLL's getLastKeycode function to be called as GMusicMediaFix.HotkeyLib.getLastKeycode().
      GMusicMediaFix.HotkeyLib.getLastKeycode = GMusicMediaFix.HotkeyLib.libC.declare(
        "getLastKeycode", //C function name
        ctypes.default_abi, //Default call ABI
        ctypes.int32_t //C function return type
      );

      //Set up an interval to test for media key presses every 50ms and if one is found,
      //perform the appropriate action on the Google Play Music document.
      GMusicMediaFix.HotkeyLib.hotkeyIntervalID = setInterval(function () {
        //Get the keycode value from the DLL.
        var keycodeValue = 0;

        if (GMusicMediaFix.HotkeyLib.getLastKeycode != null) {
          keycodeValue = GMusicMediaFix.HotkeyLib.getLastKeycode();

          //If the keycode value is nonzero, there was a media key press
          //since our last call to getLastKeycode().
          if (keycodeValue != 0) {
            //Setup a variable for Google Play's document object.
            var googlePlayDocument = GMusicMediaFix.Functions.getFirstGooglePlayDoc();

            //Check that there is a Google Play Music tab open.
            if (googlePlayDocument != null) {
              //Setup a variable for which element in the Google Play tab we are going to
              //simulate a mouse click on.
              var elementToClick = null;

              //If the DLL returned keycode=1, the Play/Pause media key was pressed.
              if (keycodeValue == 1) {
                elementToClick = GMusicMediaFix.Functions.getButtonWithDataID(
                  googlePlayDocument, "play-pause");
              }

              //If the DLL returned keycode=2, the Stop media key was pressed.
              else if (keycodeValue == 2) {
                //Check if the player is already playing. If so, we will click on it.
                //If not, we do nothing.
                var playButton = GMusicMediaFix.Functions.getButtonWithDataID(
                  googlePlayDocument, "play-pause");

                if (playButton != null) {
                  if (playButton.getAttribute("title").indexOf("Pause") != -1) {
                    elementToClick = playButton;
                  }
                }
              }

              //If the DLL returned keycode=3, the Rewind media key was pressed.
              else if (keycodeValue == 3) {
                elementToClick = GMusicMediaFix.Functions.getButtonWithDataID(
                  googlePlayDocument, "rewind");
              }

              //If the DLL returned keycode=4, the Fast Forward media key was pressed.
              else if (keycodeValue == 4) {
                elementToClick = GMusicMediaFix.Functions.getButtonWithDataID(
                  googlePlayDocument, "forward");
              }

              //Ensure that we have an element to click before continuing.
              if (elementToClick != null) {
                //Simulate a mouse click on the element.
                elementToClick.click();
              }
            }
          }
        }
      }, 50);

      //Set up an interval to watch for when all Google Play Music tabs are closed and then cleanup.
      GMusicMediaFix.HotkeyLib.tabWatchIntervalID = setInterval(function () {
        if (GMusicMediaFix.Functions.googlePlayTabNum() == 0) {
          if (GMusicMediaFix.HotkeyLib.cleanup() != null) {
            GMusicMediaFix.HotkeyLib.cleanup();
          }
        }
      }, 1000);
    }
  },

  getLastKeycode: null,

  cleanup: function () {
    if (GMusicMediaFix.HotkeyLib.libC != null) {
      //Clear the interval we previously set up to test for media key presses every 50ms.
      clearInterval(GMusicMediaFix.HotkeyLib.hotkeyIntervalID);

      //Clear the interval we previously set to watch for when all Google Play Music tabs are closed.
      clearInterval(GMusicMediaFix.HotkeyLib.tabWatchIntervalID);

      //Set up the DLL's cleanup function.
      var dllCleanup = GMusicMediaFix.HotkeyLib.libC.declare("cleanup", //C function name
        ctypes.default_abi, //Default call ABI
        ctypes.void_t //C function return type
      );

      //Run the DLL's cleanup function.
      if (dllCleanup != null) {
        dllCleanup();
      }

      //Close the C library.
      GMusicMediaFix.HotkeyLib.libC.close();

      //Reset items in GMusicMediaFix.HotkeyLib.
      GMusicMediaFix.HotkeyLib.libC = null;
      GMusicMediaFix.HotkeyLib.hotkeyIntervalID = 0;
      GMusicMediaFix.HotkeyLib.tabWatchIntervalID = 0;
      GMusicMediaFix.HotkeyLib.getLastKeycode = null;
    }
  }
};

//Various functions used by the addon.
if (!GMusicMediaFix.Functions) GMusicMediaFix.Functions = {
  //Will return the total number of tabs with Google Play Music open across all firefox windows
  googlePlayTabNum: function () {
    var tabCount = 0;

    //Go through all open firefox windows.
    var winMediator = Components.classes[
      "@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces
      .nsIWindowMediator);
    var winEnum = winMediator.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
      var currWin = winEnum.getNext();

      //Go through all open tabs in those windows.
      var tabNum = currWin.gBrowser.browsers.length;

      for (var i = 0; i < tabNum; i++) {
        var currTab = currWin.gBrowser.getBrowserAtIndex(i);

        //If any tab is a Google Play Music tab, increment the counter.
        if (currTab.currentURI.spec.indexOf("play.google.com/music") != -1) {
          tabCount = tabCount + 1;
        }
      }
    }

    return tabCount;
  },

  //Will return the document object corresponding to the first Google Play Music
  //tab with an enabled play button
  getFirstGooglePlayDoc: function () {
    //Go through all open firefox windows.
    var winMediator = Components.classes[
      "@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces
      .nsIWindowMediator);
    var winEnum = winMediator.getEnumerator("navigator:browser");
    while (winEnum.hasMoreElements()) {
      var currWin = winEnum.getNext();

      //Go through all open tabs in those windows.
      var tabNum = currWin.gBrowser.browsers.length;

      for (var i = 0; i < tabNum; i++) {
        var currTab = currWin.gBrowser.getBrowserAtIndex(i);

        //If any tab is a Google Play Music tab, return the tab's document object
        //if it has an enabled play button.
        if (currTab.currentURI.spec.indexOf("play.google.com/music") != -1) {
          var playButton = GMusicMediaFix.Functions.getButtonWithDataID(currTab
            .contentDocument, "play-pause");

          if (playButton != null) {
            if (playButton.getAttribute("disabled") == null) {
              return currTab.contentDocument;
            }
          }
        }
      }
    }

    return null;
  },

  //Will return the element corresponding to the first button in the specified document
  //that has the specified 'data-id' attribute. Returns null if no such element is found.
  getButtonWithDataID: function (documentParam, dataIDVal) {
    //Get all of the buttons in the document.
    var buttons = documentParam.getElementsByTagName("button");

    //Go through all buttons, get their 'data-id' attributes, and compare with the
    //provided value. If they match, return the element corresponding to the button.
    for (var i = 0; i < buttons.length; i++) {
      var attributeVal = buttons[i].getAttribute("data-id");

      if (attributeVal != null) {
        if (attributeVal.indexOf(dataIDVal) != -1) {
          return buttons[i];
        }
      }
    }

    return null;
  }
};

//Add an event listener to determine when a tab is opened with Google Music.
window.addEventListener('DOMContentLoaded', function (event) {
  //Once Google Play Music is open, initialize everything and register the hotkeys.
  if (event.target.URL.indexOf("play.google.com/music") != -1) {
    //Initialize everything.
    if (GMusicMediaFix.HotkeyLib.init != null) {
      GMusicMediaFix.HotkeyLib.init();
    }
  }
});

//Add an event listener to determine when a Google Play Music tab is closed.
window.addEventListener('TabClose', function (event) {
  //Once all Google Play Music tabs are closed, cleanup and unregister the hotkeys.
  if (event.target.linkedBrowser.contentDocument.location.href.indexOf(
    "play.google.com/music") != -1) {
    if (GMusicMediaFix.Functions.googlePlayTabNum() == 1) {
      if (GMusicMediaFix.HotkeyLib.cleanup() != null) {
        GMusicMediaFix.HotkeyLib.cleanup();
      }
    }
  }
});

//Add an event listener to clean everything up if there are no more Google Play Music
//tabs open when the window gets unloaded.
window.addEventListener('unload', function (event) {
  //Make sure there are no Google Play Music tabs still open before cleaning up.
  if (GMusicMediaFix.Functions.googlePlayTabNum() == 0) {
    if (GMusicMediaFix.HotkeyLib.cleanup() != null) {
      GMusicMediaFix.HotkeyLib.cleanup();
    }
  }
});
