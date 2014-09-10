define(function(require) {
  'use strict';

  console.log('HOLA DESDE panels/app_permissions_activities/panel.js');
  var SettingsPanel = require('modules/settings_panel');

  return function ctor_list_activities() {
    return SettingsPanel({
      onInit: function(panel, options) {
        console.log('panels/app_permissions_activities/panel.js onInit');
      }
    });
  };
});