'use strict';
/* global ActionMenu, applications, ManifestHelper, SettingsHelper */

(function(exports) {

  /**
   * Handles relaying of information for web activities.
   * Contains code to display the list of valid activities,
   * and fires an event off when the user selects one.
   * @class Activities
   */
  function Activities() {
    window.addEventListener('mozChromeEvent', this);
    window.addEventListener('appopened', this);
    this.actionMenu = null;
  }

  Activities.prototype = {
    /** @lends Activities */

    /**
    * General event handler interface.
    * Updates the overlay with as we receive load events.
    * @memberof Activities.prototype
    * @param {DOMEvent} evt The event.
    */
    handleEvent: function(evt) {
      switch (evt.type) {
        case 'mozChromeEvent':
          var detail = evt.detail;
          switch (detail.type) {
            case 'activity-choice':
              this.chooseActivity(detail);
              break;
          }
          break;
        case 'appopened':
          if (this.actionMenu) {
            this.actionMenu.hide();
          }
          break;
      }
    },

    /**
     * This gets the index from the defaultChoice in the choices
     * list.
     * @param  {Object} defaultChoice The default choice
     * @return {Integer}              The index where the default
     *                                choice is located. -1 if it
     *                                is not found
     */
    _choiceFromDefaultAction: function(defaultChoiceManifest) {
      console.log('_choiceFromDefaultAction');

      var index = -1;
      if (defaultChoiceManifest) {
        index = this._detail.choices.findIndex(function(choice) {
          return choice.manifest.indexOf(defaultChoiceManifest) !== -1;
        });
      }
      console.log('Index=', index);
      return index;
    },

    _getDefaultAction: function(cb) {
      console.log('_getDefaultAction');

      var detail = this._detail;
      // If we do not have a name for the activity, we should return that
      // we do not have a default action
      if (!detail.name) {
        cb.bind(this)(null);
      }
      var settingNameBase = 'activity.default.' + detail.name;
      console.log('_getDefaultAction, getting default action for', settingNameBase);
      var defaultActionHelper = SettingsHelper(settingNameBase, null);
      defaultActionHelper.get(function (value) {
        console.log('_getDefaultAction', value);
        cb.bind(this)(value);
      });
    },

    /**
     * Sets a preference with the default choice for this activity
     * that detail holds.
     * @param {[type]} choice [description]
     * @param {[type]} detail [description]
     */
    _setDefaultAction: function(choice) {
      console.log('_setDefaultAction');

      var settingsToAdd = [];

      var filters = this._detail.filters || [];
      // Convert simple filters to Array so we have a common function
      if (!Array.isArray(filters)) {
        filters = [filters];
      }

      // This is the default base name for the setting.
      // For 'pick' we will have 'activity.default.pick'
      var settingNameBase = 'activity.default.' + this._detail.name;
      if (filters.length === 0) {
        console.log('SINGLE - Going to set', settingNameBase, 'to', choice.manifest);
        SettingsHelper(settingNameBase).set(choice.manifest);
        settingsToAdd.push(settingNameBase);
      } else {
        // In this case we will have a different preference for each
        // filter, like:
        // 'activity.default.pick.image/*'
        filters.forEach(function(filter) {
          if (filter) {
            var settingName = settingNameBase + '.' + filter;
            console.log('MULTIPLE - Going to set', settingName, 'to', choice.manifest);
            SettingsHelper(settingName).set(choice.manifest);
            settingsToAdd.push(settingName);
          }
        });
      }

      this._addDefaultActivitySettings(settingsToAdd);
    },

    /**
     * This add the new activity settings in the settings list
     * so it can be show in the Settings app.
     * @param {Array} settings List of settings to add
     */
    _addDefaultActivitySettings: function(settings) {
      var SETTING_SEPARATOR = '___';
      var parsed;
      var defaultActivitySettingsName = 'activity.default.__list__';
      var defaultActivitySettingsHelper =
        SettingsHelper(defaultActivitySettingsName, '');
      defaultActivitySettingsHelper.get(function (value) {
        console.log('_addDefaultActivitySettings, previous value', value);
        parsed = value.split(SETTING_SEPARATOR);

        // Fill a map with the settings.
        var map = {};
        for (var i = 0; i < parsed.length; i++) {
          if (parsed[i] && parsed[i].length > 0) {
            map[parsed[i]] = true;
          }
        }

        for (var j = 0; j < settings.length; j++) {
          map[settings[j]] = true;
        }

        console.log('_addDefaultActivitySettings, map', map);
        var keys = Object.keys(map);
        var toSave = keys.join(SETTING_SEPARATOR);
        console.log('_addDefaultActivitySettings, string', toSave);

        defaultActivitySettingsHelper.set(toSave);
      });
    },

   /**
    * Displays the activity menu if needed.
    * If there is only one option, the activity is automatically launched.
    * @memberof Activities.prototype
    * @param {Object} detail The activity choose event detail.
    */
    chooseActivity: function(detail) {
      console.log('chooseActivity', detail);
      this._detail = detail;
      this.publish('activityrequesting');

      this._getDefaultAction(function onGotDefaultAction(defaultChoice) {
        this._gotDefaultAction.bind(this)(defaultChoice);
      }.bind(this));
    },

    _gotDefaultAction: function(defaultChoice) {
      console.log('_gotDefaultAction', defaultChoice);

      var choices = this._detail.choices;
      var index = this._choiceFromDefaultAction.bind(this)(defaultChoice);
      if (index > -1) {
        console.log('Ok, got a defaultChoice, choose it with index', index);
        this.choose(index);
      } else if (choices.length === 1) {
        console.log('We only have one choice, select it');
        this.choose('0');
      } else {
        //
        // Our OMA Forward Lock DRM implementation relies on a "view"
        // activity to invoke the "fl" app when the user clicks on a
        // link to content with a mime type of
        // "application/vnd.oma.dd+xml" or "application/vnd.oma.drm.message".
        //
        // In order for this to be secure, we need to ensure that the
        // FL app is the only one that can respond to view activity
        // requests for those particular mime types. Here in the System app
        // we don't know what the type associated with an activity request is
        // but we do know the name of the activity. So if this is an activity
        // choice for a "view" activity, and the FL app is one of the choices
        // then we must select the FL app without allowing the user to choose
        // any of the others.
        //
        // If we wanted to be more general here we could perhaps
        // modify this code to allow any certified app to handle the
        // activity, but it is much simpler to restrict to the FL app
        // only.
        //
        if (this._detail.name === 'view') {
          var flAppIndex = choices.findIndex(function(choice) {
            return choice.manifest.indexOf('//fl.gaiamobile.org/') !== -1;
          });
          if (flAppIndex !== -1) {
            this.choose(flAppIndex.toString(10)); // choose() requires a string
            return;
          }
        }

        // Since the mozChromeEvent could be triggered by a 'click', and gecko
        // event are synchronous make sure to exit the event loop before
        // showing the list.
        setTimeout((function nextTick() {
          // Bug 852785: force the keyboard to close before the activity menu
          // shows
          window.dispatchEvent(new CustomEvent('activitymenuwillopen'));

          var activityName = navigator.mozL10n.get('activity-' +
            this._detail.name);
          if (!this.actionMenu) {
            this.actionMenu = new ActionMenu(this._listItems(choices),
              activityName, this.choose.bind(this), this.cancel.bind(this),
              null, true);
            this.actionMenu.start();
          }
        }).bind(this));
      }
    },

   /**
    * The user chooses an activity from the activity menu.
    * @memberof Activities.prototype
    * @param {Number} choice The activity choice.
    * @param {Boolean} setAsDefault Should this be set as the default activity.
    */
    choose: function(choice, setAsDefault) {
     console.log('choose', choice, setAsDefault);
      this.actionMenu = null;

      var returnedChoice = {
        id: this._detail.id,
        type: 'activity-choice',
        value: choice,
        setAsDefault: setAsDefault
      };

      if (setAsDefault) {
        console.log('We need to set default');
        this._setDefaultAction.bind(this)(this._detail.choices[choice]);
      } else {
        console.log('Not default activity');
      }

      this._sendEvent(returnedChoice);
      delete this._detail;
    },

   /**
    * Cancels from the activity menu.
    * @memberof Activities.prototype
    */
    cancel: function() {
      this.actionMenu = null;

      var returnedChoice = {
        id: this._detail.id,
        type: 'activity-choice',
        value: -1
      };

      this._sendEvent(returnedChoice);
      delete this._detail;
    },

    publish: function(eventName) {
      var event = new CustomEvent(eventName);
      window.dispatchEvent(event);
    },

    /**
     * Sends an event to the platform when a user makes a choice
     * or cancels the activity menu.
     * @memberof Activities.prototype
     * @param {Number} value The index of the selected activity.
     */
    _sendEvent: function(value) {
      var event = document.createEvent('CustomEvent');
      event.initCustomEvent('mozContentEvent', true, true, value);
      window.dispatchEvent(event);
    },

    /**
     * Formats and returns a list of activity choices.
     * @memberof Activities.prototype
     * @param {Array} choices The list of activity choices.
     * @return {Array}
     */
    _listItems: function(choices) {
      var items = [];

      choices.forEach(function(choice, index) {
        var app = applications.getByManifestURL(choice.manifest);
        if (!app) {
          return;
        }

        items.push({
          label: new ManifestHelper(app.manifest).name,
          icon: choice.icon,
          manifest: choice.manifest,
          value: index
        });
      });

      return items;
    }
  };

  exports.Activities = Activities;

}(window));
