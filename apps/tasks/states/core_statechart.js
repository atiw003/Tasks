/**
 * A mixin that defines the application statechart.
 *
 * @author Suvajit Gupta
 * License: Licened under MIT license (see license.js)
 */
/*globals CoreTasks Tasks Ki */

// TODO: [MC/SG] make root responder work with Ki and then remove default responder in each panel
Tasks.mixin( /** @scope Tasks */ {
  
  statechart: Ki.Statechart.create({

    // Set tracing on to debug statecharts
    trace: YES,
  
    rootState: Ki.State.design({

      initialSubstate: 'loggedOut',

      enterState: function() {
        CoreTasks.initializeStore();
      },

      // State when user hasn't logged in yet
      loggedOut: Ki.State.plugin('Tasks.LoggedOutState'),
    
      // State after user logs in and the application is ready to use
      loggedIn: Ki.State.plugin('Tasks.LoggedInState'),

      // State to manage application termination
      shutDown: Ki.State.plugin('Tasks.ShutDownState')

    })
  
  })

});