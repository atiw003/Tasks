// ==========================================================================
// Project:   Tasks
// License:   Licened under MIT license (see license.js)
// ==========================================================================
/**

  "Tasks" - an agile project management tool
  
  @extends SC.Object
  @author Suvajit Gupta
  @version 0.1
*/
/*globals Tasks CoreTasks */

Tasks = SC.Object.create(
  /** @scope Tasks.prototype */ {

  NAMESPACE: 'Tasks',
  VERSION: '1.5',
  isLoaded: NO, // for Lebowski
  
  /*
   * Tasks server types.  Defaulted to GAE - detected/set at runtime
   */
  NO_SERVER: 0x0000,
  PERSEVERE_SERVER: 0x0001,
  GAE_SERVER: 0x0002,
  serverType: 0x0002,
  
  /**
   * A computed property to indicate whether the server is capable of sending notifications.
   * @returns {Boolean} true: if connected to a server that supports notifications, false otherwise
   */
  canServerSendNotifications: function() {
    if(CoreTasks.get('dataSourceType') === CoreTasks.FIXTURES_DATA_SOURCE) return true; // to assist with testing via fixtures
    return this.get('serverType') === this.GAE_SERVER;
  }.property('serverType').cacheable(),
  
  /**
   * Returns link to Tasks application
   */
  getBaseUrl: function() {
    return window.location.protocol + '//' + window.location.host + window.location.pathname;
  },
  
  /**
   * Returns link to Tasks help
   */
  getHelpUrl: function() {
    return static_url('help.html') + '?softwareMode=' + Tasks.softwareMode;
  },
  
  /**
   * Sorting function based on 'name' key.
   */
  nameAlphaSort: function(a,b) {
    var aName = a.get('name');
    var bName = b.get('name');
    if(aName === bName) return 0;
    else return aName > bName? 1 : -1;
  },
  
  /**
   * Called by CoreTasks when data saves fail.
   *
   * @param (String) type of record for which save failed
   */
  dataSaveErrorCallback: function(errorRecordType) {
    // console.log('DEBUG: dataSaveErrorCallback(' + errorRecordType + ')');
    var serverMessage = Tasks.getPath('mainPage.mainPane.serverMessage');
    serverMessage.set('value', "_DataSaveError".loc() + SC.DateTime.create().toFormattedString(CoreTasks.TIME_DATE_FORMAT));
  }
    
});


/**
  Some view overrides to turn off escapeHTML for menu items in context menus and select buttons.
*/
SC.MenuItemView = SC.MenuItemView.extend({
  escapeHTML: NO
});

SC.SelectButtonView = SC.SelectButtonView.extend({
  escapeHTML: NO
});

SCUI.ContextMenuPane = SCUI.ContextMenuPane.extend({
  exampleView: SC.MenuItemView
});

// TODO: [SG] remove hack for SCUI ComboBoxView using an SC.ButtonView since it doesn't fit unless all SC styles are overridden
SCUI.ComboBoxView.prototype.dropDownButtonView = SC.View.extend( SCUI.SimpleButton, {
  classNames: 'scui-combobox-dropdown-button-view',
  layout: { top: 0, right: 0, height: 24, width: 28 }
});

// TODO: [SG/EG] update SCUI.ToolTip to work with SC master (new rendering subsystem), CheckboxView still not working

// TODO: [SG/BB] make SCUI.ModalPane close button target/action overridable without snippet below
SCUI.ModalPane = SCUI.ModalPane.extend({
  initMixin: function() {
    var headerCloseButton = this.childViews[0].closeButton;
    headerCloseButton.set('target', null);
    headerCloseButton.set('action', 'close');
  }
});

/**
  A Standard Binding transform to localize a string in a binding.
*/
SC.Binding.toLocale = function() {
  return this.transform(function(value, binding) {
    var returnValue = '';
    if (SC.typeOf(value) === SC.T_STRING) {
      returnValue = "%@".fmt(value).loc();
    }
    return returnValue;
  });
};

// if software mode set to false, works as a simple To Do list (Task Type/Validation are not available through GUI)
Tasks.softwareMode = document.title.match(/todo/i)? false: true;