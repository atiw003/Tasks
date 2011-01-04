/**
 * A mixin that defines all of the "actions" that trigger state transitions.
 *
 * @author Sean Eidemiller
 * @author Suvajit Gupta
 * License: Licened under MIT license (see license.js)
 */
/*globals CoreTasks Tasks SCUDS sc_require */

sc_require('controllers/users');
sc_require('controllers/projects');
sc_require('controllers/tasks');

Tasks.mixin( /** @scope Tasks */ {

  loginName: null,
  loadDoneProjectData: false,

  /**
   * Authenticate user trying to log in to Tasks application.
   *
   * @param {String} user's login name.
   * @param {String} user's password.
   */
  authenticate: function(loginName, password) {
    // console.log('DEBUG: authenticate()');
    Tasks.set('loginName', loginName);
    if(CoreTasks.get('dataSourceType') === CoreTasks.REMOTE_DATA_SOURCE) { // perform remote authentication
      var params = {
        successCallback: this._authenticationSuccess.bind(this),
        failureCallback: this._authenticationFailure.bind(this)
      };
      return CoreTasks.User.authenticate(loginName, password, params);
    }
    else { // perform authentication with fixtures data
      for(var i = 0, len = CoreTasks.User.FIXTURES.length; i < len; i++) {
        if(loginName === CoreTasks.User.FIXTURES[i].loginName) {
          return this._authenticationSuccess();
        }
      }
      return this._authenticationFailure();
    }
  },
  
  /**
   * Called after successful authentication.
   */
  _authenticationSuccess: function(response, request) {
    
    // console.log('DEBUG: _authenticationSuccess()');
    // Start GUI and setup startup defaults
    Tasks.getPath('mainPage.mainPane').append();
    Tasks.mainPageHelper.set('clippyDetails', document.getElementById(Tasks.mainPageHelper.clippyDetailsId));
    if(SC.none(request)) {
      Tasks.set('serverType', Tasks.NO_SERVER); // Fixtures mode
    }
    else {
      var headers = request.get('headers');
      if(SC.typeOf(headers) === SC.T_HASH) {
        var server = headers.Server || headers.server;
        if(server && server.indexOf('Persevere') !== -1) Tasks.set('serverType', Tasks.PERSEVERE_SERVER);
      }
    }
    
    // Create system projects
    if(!CoreTasks.get('allTasksProject')) {
      var allTasksProject = CoreTasks.createRecord(CoreTasks.Project, {
        name: CoreTasks.ALL_TASKS_NAME.loc()
      });
      CoreTasks.set('allTasksProject', allTasksProject);
      CoreTasks.set('needsSave', NO);
    }
    if(!CoreTasks.get('unallocatedTasksProject')) {
      var unallocatedTasksProject = CoreTasks.createRecord(CoreTasks.Project, {
        name: CoreTasks.UNALLOCATED_TASKS_NAME.loc()
      });
      CoreTasks.set('unallocatedTasksProject', unallocatedTasksProject);
      CoreTasks.set('needsSave', NO);
    }
    if(!CoreTasks.get('unassignedTasksProject')) {
      var unassignedTasksProject = CoreTasks.createRecord(CoreTasks.Project, {
        name: CoreTasks.UNASSIGNED_TASKS_NAME.loc()
      });
      CoreTasks.set('unassignedTasksProject', unassignedTasksProject);
      CoreTasks.set('needsSave', NO);
    }
    
    // Setup user controller and then current logged on user
    // Note: sequence is important below - logged in user must be loaded after data is preloaded from LDS to get new authToken
    // FIXME: [SG] don't send private information (like email address) for users from GAE Server - these can be seen in localStorage later
    var currentUser = null;
    if (!CoreTasks.get('allUsers')) {
      CoreTasks.set('allUsers', CoreTasks.store.find(
        SC.Query.create({ recordType: CoreTasks.User, orderBy: 'name', localOnly: YES })));
      this.usersController.set('content', CoreTasks.get('allUsers'));
    }
    if(SC.none(response)) {
      currentUser = CoreTasks.getUserByLoginName(Tasks.get('loginName'));
    }
    else {
      SC.RunLoop.begin();
      CoreTasks.store.loadRecords(CoreTasks.User, response);
      SC.RunLoop.end();
      currentUser = CoreTasks.getUserByLoginName(response[0].loginName);
    }

    // Greet user and save login session information
    CoreTasks.set('currentUser', currentUser);
    CoreTasks.setPermissions();
    var welcomeMessage = Tasks.getPath('mainPage.mainPane.welcomeMessage');
    welcomeMessage.set('toolTip', "_LoginSince".loc() + SC.DateTime.create().toFormattedString(CoreTasks.TIME_DATE_FORMAT));

    // Based on user's role set up appropriate task filter
    if(CoreTasks.getPath('currentUser.role') === CoreTasks.USER_ROLE_DEVELOPER) { // Set assignee selection filter to current user
      Tasks.showCurrentUserTasks();
    }

    // Setup projects/tasks/watches controllers
    if (!CoreTasks.get('allProjects')) {
      CoreTasks.set('allProjects', CoreTasks.store.find(
        SC.Query.create({ recordType: CoreTasks.Project, orderBy: 'name', localOnly: YES })));
      this.projectsController.set('content', CoreTasks.get('allProjects'));
    }
    if (!CoreTasks.get('allTasks')) {
      CoreTasks.set('allTasks', CoreTasks.store.find( 
        SC.Query.create({ recordType: CoreTasks.Task, localOnly: YES })));
    }
    if (!CoreTasks.get('allWatches')) {
      CoreTasks.set('allWatches', CoreTasks.store.find(
        SC.Query.create({ recordType: CoreTasks.Watch, localOnly: YES })));
    }
    if (!CoreTasks.get('allComments')) {
      CoreTasks.set('allComments', CoreTasks.store.find(
        SC.Query.create({ recordType: CoreTasks.Comment, localOnly: YES })));
    }
    this._selectDefaultProject(false);

    Tasks.statechart.gotoState('loggedIn');
  },

  /**
   * Called after failed authentication.
   *
   * @param {SC.Response} response object from failed call
   */
  _authenticationFailure: function(response) {
    // console.log('DEBUG: _authenticationFailure()');
    var errorString = SC.instanceOf(response, SC.Error)? "_LoginServerAccessError".loc() : "_LoginAuthenticationError".loc();
    Tasks.loginController.displayLoginError(errorString);
  },
  
  /**
   * Load all Tasks data from the server.
   */
  loadData: function() {
    
    // Indicate data loading start on status bar
    var serverMessage = Tasks.getPath('mainPage.mainPane.serverMessage');
    serverMessage.set('icon', 'progress-icon');
    serverMessage.set('value', "_LoadingData".loc());

    // Get the last retrieved information from localStorage (if available).
    var lastRetrieved = Tasks.get('lastRetrieved');
    if(SC.empty(lastRetrieved) && CoreTasks.useLocalStorage) {
      var adapter;
      adapter = this._adapter = SCUDS.LocalStorageAdapterFactory.getAdapter('Tasks');
      lastRetrieved = adapter.get('lastRetrieved');
      // console.log('DEBUG: setting lastRetrieved value from localStorage: ' + lastRetrieved);
      if (!SC.empty(lastRetrieved)) {
        var lastRetrievedAt = parseInt(lastRetrieved, 10);
        var monthAgo = SC.DateTime.create().get('milliseconds') - 30*CoreTasks.MILLISECONDS_IN_DAY;
        if(isNaN(lastRetrievedAt) || lastRetrievedAt < monthAgo) {
          // console.log('DEBUG: resetting lastRetrieved for aged local storage data');
          SCUDS.LocalStorageAdapterFactory.nukeAllAdapters();
          lastRetrieved = null;
        }
      }
    }

    // Branch on the server type (Persevere, GAE, fixtures).
    var params = {
      successCallback: this._loadDataSuccess.bind(this),
      failureCallback: this._loadDataFailure.bind(this)
    };
    var serverType = Tasks.get('serverType');
    if (serverType === Tasks.PERSEVERE_SERVER) {
      // Determine which function to call based on value of lastRetieved.
      var methodInvocation;
      if (SC.empty(lastRetrieved)) {
        methodInvocation = { method: 'get', id: 'records', params: [Tasks.loadDoneProjectData] };
      } else {
        methodInvocation = { method: 'getDelta', id: 'records', params: [lastRetrieved] };
      }
      CoreTasks.executeTransientPost('Class/all', methodInvocation, params);
    } else if(serverType === Tasks.GAE_SERVER){
      params.queryParams = { 
        UUID: CoreTasks.getPath('currentUser.id'),
        ATO: CoreTasks.getPath('currentUser.authToken'),
        action: 'getRecords',
        loadDoneProjectData: Tasks.loadDoneProjectData,
        lastRetrievedAt: lastRetrieved || ''
      };
      CoreTasks.executeTransientGet('records', undefined, params);
    } else { // Fixtures mode
      this._loadDataSuccess();
    }

    // Set the last retrieved value in localStorage.
    lastRetrieved = SC.DateTime.create().get('milliseconds') + ''; // now
    if(CoreTasks.useLocalStorage) {
      // console.log('DEBUG: setting lastRetrieved value in localStorage: ' + lastRetrieved);
      this._adapter.save(lastRetrieved, 'lastRetrieved');
    }
    Tasks.set('lastRetrieved', lastRetrieved);

  },
  
  /**
   * Called after data loaded successfully.
   */
  _loadDataSuccess: function(response) {
    // console.log('DEBUG: loadDataSuccess()');
 
    if(response) { // Has a Server, not Fixtures mode
      // Process/load records into store
      var typeMap = {
        "users":     CoreTasks.User,
        "tasks":     CoreTasks.Task,
        "projects":  CoreTasks.Project,
        "watches":   CoreTasks.Watch,
        "comments":   CoreTasks.Comment
      };
      var recordSets = response.result;
      SC.RunLoop.begin();
      for(var recordSet in recordSets) {
        var recordType = typeMap[recordSet];
        if(SC.typeOf(recordType) === SC.T_CLASS) {
          var records = recordSets[recordSet];
          // console.log('DEBUG: loading ' + records.length + ' ' + recordSet);
          CoreTasks.store.loadRecords(recordType, records);
          if(CoreTasks.useLocalStorage) {
            var recordTypeStr = SC.browser.msie ? recordType._object_className : recordType.toString();
            var adapter = SCUDS.LocalStorageAdapterFactory.getAdapter(recordTypeStr);
            adapter.save(records);
          }
        }
      }
      SC.RunLoop.end();
    }
    if(CoreTasks.loginTime) {
      if(this.get('defaultProjectId')) this._selectDefaultProject(true);
      CoreTasks.loginTime = false;
    }
 
    // Indicate data loading completion on status bar
    var serverMessage = Tasks.getPath('mainPage.mainPane.serverMessage');
    serverMessage.set('icon', '');
    serverMessage.set('value', "_DataLoaded".loc() + SC.DateTime.create(parseInt(Tasks.get('lastRetrieved'), 10)).toFormattedString(CoreTasks.TIME_DATE_FORMAT));
    Tasks.projectsController.refreshCountdowns();

  },
  
  /**
   * Called after failed data load.
   */
  _loadDataFailure: function(response) {
    var serverMessage = Tasks.getPath('mainPage.mainPane.serverMessage');
    serverMessage.set('icon', '');
    serverMessage.set('value', "_DataLoadFailed".loc() + SC.DateTime.create().toFormattedString(CoreTasks.TIME_DATE_FORMAT));
  },
  
  /**
   * Select default project if one is specified via a Route
   */
  _selectDefaultProject: function(warnIfMissing) {
    var defaultProject = CoreTasks.get('allTasksProject');
    var defaultProjectId = this.get('defaultProjectId');
    // console.log('DEBUG: selectDefaultProject() defaultProjectId=' + defaultProjectId);
    if(defaultProjectId) { // if specified via a Route
      var project = CoreTasks.getProjectById(defaultProjectId); // see if such a project exists
      if(project) {
        defaultProject = project;
        this.set('defaultProjectId', null);
      }
      else if(warnIfMissing) {
        console.warn('selectDefaultProject(): No project of ID #' + defaultProjectId);
      }
    }
    this.set('defaultProject', defaultProject);
    this.projectsController.selectObject(defaultProject);
  },
  
  /**
   * Save modified Tasks data to server.
   */
  saveData: function() {
    if(CoreTasks.get('needsSave')) {
      var serverMessage = Tasks.getPath('mainPage.mainPane.serverMessage');
      CoreTasks.saveChanges();
      serverMessage.set('value', "_DataSaved".loc() + SC.DateTime.create().toFormattedString(CoreTasks.TIME_DATE_FORMAT));
    }
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
  },

  /**
   * Add a new project in projects master list.
   */
  addProject: function() {
    this._createProject(false);
  },
  
  /**
   * Duplicate selected project in projects master list.
   *
   * @param {Boolean} flag to indicate whether to make a duplicate of selected project.
   */
  duplicateProject: function() {
    this._createProject(true);
  },
  
  /**
   * Create a new project in projects master list and start editing it .
   *
   * @param {Boolean} flag to indicate whether to make a duplicate of selected task.
   */
  _createProject: function(duplicate) {
    
    if(!CoreTasks.getPath('permissions.canCreateProject')) {
      console.warn('You do not have permission to add or duplicate a project');
      return;
    }
    
    var projectHash = SC.clone(CoreTasks.Project.NEW_PROJECT_HASH);
    projectHash.name = projectHash.name.loc();
    if(duplicate) {
      var selectedProject = Tasks.projectsController.getPath('selection.firstObject');
      if (!selectedProject) {
        console.warn('You must have a project selected to duplicate it');
        return;
      }
      projectHash.name = selectedProject.get('name') + "_Copy".loc();
      projectHash.description = selectedProject.get('description');
      projectHash.timeLeft = selectedProject.get('timeLeft');
      projectHash.developmentStatus = selectedProject.get('developmentStatus');
    }
    
    // Create, select, and begin editing new project.
    var project = CoreTasks.createRecord(CoreTasks.Project, projectHash);
    var pc = this.projectsController;
    pc.selectObject(project);
    Tasks.projectEditorPage.popup(project);

  },
  
  /**
  * Delete selected projects, asking for confirmation first.
   */
  deleteProject: function() {
    
    if(!CoreTasks.getPath('permissions.canDeleteProject')) {
      console.warn('You do not have permission to delete a project');
      return;
    }
    
    var sel = Tasks.projectsController.get('selection');
    var len = sel? sel.length() : 0;
    if (len > 0) {

      // Confirm deletion operation
      SC.AlertPane.warn("_Confirmation".loc(), "_ProjectDeletionConfirmation".loc(), "_ProjectDeletionConsequences".loc(), "_Yes".loc(), "_No".loc(), null,
      SC.Object.create({
        alertPaneDidDismiss: function(pane, status) {
          if(status === SC.BUTTON1_STATUS) {
            var context = {};
            for (var i = 0; i < len; i++) {
              // Get and delete each selected (non-system) project.
              var project = sel.nextObject(i, null, context);
              if (CoreTasks.isSystemProject(project)) {
                console.warn('You cannot delete a system project');
              }
              else {
                // Reset default project if it is deleted
                if(project === Tasks.get('defaultProject')) Tasks.set('defaultProject', CoreTasks.get('allTasksProject'));
                project.destroy();
              }
            }
            // Select the default project
            Tasks.projectsController.selectObject(Tasks.get('defaultProject'));
            if(CoreTasks.get('autoSave')) Tasks.saveData();
          }
        }
        })
      );

    }
  },

  /**
   * Filter tasks via attributes.
   */
  filterTasks: function() {
    Tasks.filterController.openPane();
  },

  /**
   * Set filter to show current user's tasks.
   */
  showCurrentUserTasks: function() {
    Tasks.assignmentsController.setAssigneeFilter(this.loginName);
  },
  
  
  /**
   * Add a new task in tasks detail list.
   *
   * @param {Boolean} flag to indicate whether to make a duplicate of selected task.
   */
  addTask: function() {
    this._createTask(false);
  },
  
  /**
   * Duplicate selected task in tasks detail list.
   *
   * @param {Boolean} flag to indicate whether to make a duplicate of selected task.
   */
  duplicateTask: function() {
    this._createTask(true);
  },
  
  /**
   * Delete selected task in tasks detail list.
   */
  /**
   * Create a new task in tasks detail list and start editing it.
   *
   * @param {Boolean} flag to indicate whether to make a duplicate of selected task.
   */
  _createTask: function(duplicate) {
    
    if(!Tasks.tasksController.isAddable()) {
      console.warn('This is the wrong display mode or you do not have permission to add or duplicate a task');
      return;
    }
    
    // Create a new task with the logged in user as the default submitter/assignee within selected project, if one.
    var userId = CoreTasks.getPath('currentUser.id');
    var taskHash = SC.merge({ 'submitterId': userId }, SC.clone(CoreTasks.Task.NEW_TASK_HASH));
    taskHash.name = taskHash.name.loc();
    if(Tasks.getPath('projectsController.selection.firstObject') !== CoreTasks.get('unassignedTasksProject') &&
       CoreTasks.getPath('currentUser.role') !== CoreTasks.USER_ROLE_GUEST) {
         taskHash.assigneeId = userId;
    }
    var sel = Tasks.projectsController.getPath('selection');
    var project = (sel && sel.get('length' === 1))? sel.get('firstObject') : null;
    if (project && CoreTasks.isSystemProject(project)) {
      taskHash.projectId = project.get('id');
    }
    
    // Get selected task (if one) and copy its project/assignee/type/priority to the new task.
    var tc = this.get('tasksController');
    sel = tc.get('selection');
    if (sel && sel.length() > 0) {
      var selectedTask = sel.firstObject();
      if (SC.instanceOf(selectedTask, CoreTasks.Task)) {
        taskHash.projectId = selectedTask.get('projectId');
        var assigneeUser = selectedTask.get('assignee');
        taskHash.assigneeId = (assigneeUser && assigneeUser.get('role') !== CoreTasks.USER_ROLE_GUEST)? assigneeUser.get('id') : null;
        taskHash.type = selectedTask.get('type');
        taskHash.priority = selectedTask.get('priority');
        if(duplicate) {
          taskHash.name = selectedTask.get('name') + "_Copy".loc();
          taskHash.effort = selectedTask.get('effort');
          taskHash.description = selectedTask.get('description');
          taskHash.developmentStatus = selectedTask.get('developmentStatus');
          taskHash.validation = selectedTask.get('validation');
        }
      }
    }
    else { // No selected task, add task to currently selected, non-system, project (if one).
      if(duplicate) {
        console.warn('You must have a task selected to duplicate it');
        return;
      }
      var selectedProject = Tasks.projectsController.getPath('selection.firstObject');
      if (!CoreTasks.isSystemProject(selectedProject)) {
        taskHash.projectId = Tasks.getPath('projectController.id');
      }
    }
    
    // Create, select, and begin editing new task.
    var task = CoreTasks.createRecord(CoreTasks.Task, taskHash);
    tc.selectObject(task);
    Tasks.getPath('mainPage.taskEditor').popup(task);
        
  },

  /**
   * Delete selected tasks, asking for confirmation first.
   */
  deleteTask: function() {
    
    if(!Tasks.tasksController.isDeletable()) {
      console.warn('This is the wrong display mode or you do not have permission to delete a task');
      return;
    }
    
    var ac = this.get('assignmentsController');      
    var tc = this.get('tasksController');
    var sel = tc.get('selection');
    var len = sel? sel.length() : 0;
    if (len > 0) {

      // Confirm deletion operation
      SC.AlertPane.warn("_Confirmation".loc(), "_TaskDeletionConfirmation".loc(), "_TaskDeletionConsequences".loc(), "_Yes".loc(), "_No".loc(), null,
      SC.Object.create({
        alertPaneDidDismiss: function(pane, status) {
          if(status === SC.BUTTON1_STATUS) {
            if(Tasks.mainPage.getPath('mainPane.tasksSceneView.nowShowing') == 'taskEditor') Tasks.getPath('mainPage.taskEditor').close();
            var context = {};
            for (var i = 0; i < len; i++) {
              // Get and delete each selected task.
              var task = sel.nextObject(i, null, context);
              task.destroy();
            }
            Tasks.tasksController.selectFirstTask();
            if(CoreTasks.get('autoSave')) Tasks.saveData();
          }
        }
        })
      );

    }
  },
  
  /**
   * Watch selected tasks (if they are not already being watched).
   */
  watchTask: function() {
    var tc = this.get('tasksController');
    var sel = tc.get('selection');
    var len = sel? sel.length() : 0;
    if (len > 0) {
      var currentUserId = CoreTasks.getPath('currentUser.id');
      var context = {};
      for (var i = 0; i < len; i++) {
        // Get and watch each selected task.
        var task = sel.nextObject(i, null, context);
        if(!CoreTasks.isCurrentUserWatchingTask(task)) {
          CoreTasks.createRecord(CoreTasks.Watch, { taskId: task.get('id'), userId: currentUserId });
        }
      }
      if(CoreTasks.get('autoSave')) Tasks.saveData();
    }
  },
  
  /**
   * Unwatch selected tasks (if they are being watched).
   */
  unwatchTask: function() {
    var tc = this.get('tasksController');
    var sel = tc.get('selection');
    var len = sel? sel.length() : 0;
    if (len > 0) {
      var context = {};
      for (var i = 0; i < len; i++) {
        // Get and unwatch each selected task.
        var task = sel.nextObject(i, null, context);
        var watch = CoreTasks.getCurrentUserTaskWatch(task);
        if(watch) watch.destroy();
      }
      if(CoreTasks.get('autoSave')) Tasks.saveData();
    }
  },
  
  /**
   * Add comment to currently selected task.
   */
  addComment: function() {
    var tc = this.get('tasksController');
    var sel = tc.get('selection');
    var len = sel? sel.length() : 0;
    if (len === 1) {
      var currentUserId = CoreTasks.getPath('currentUser.id');
      var task = tc.getPath('selection.firstObject');
      var now = SC.DateTime.create().get('milliseconds');
      var comment = CoreTasks.createRecord(CoreTasks.Comment, { taskId: task.get('id'), userId: currentUserId,
                                           createdAt: now, updatedAt: now, description: CoreTasks.NEW_COMMENT_DESCRIPTION.loc() });
      Tasks.commentsController.selectObject(comment);
    }
  }
      
});

