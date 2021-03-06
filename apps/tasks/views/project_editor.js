// ==========================================================================
// Project: Tasks
// ==========================================================================
/*globals Tasks CoreTasks */

/** 

  Project details editor.
  
  @extends SC.View
  @author Suvajit Gupta
*/
Tasks.projectEditorHelper = SC.Object.create({
  listStatuses: function() {
     var ret = [];
     ret.push({ name: '<span class=status-planned>' + CoreTasks.STATUS_PLANNED.loc() + '</span>', value: CoreTasks.STATUS_PLANNED });
     ret.push({ name: '<span class=status-active>' + CoreTasks.STATUS_ACTIVE.loc() + '</span>', value: CoreTasks.STATUS_ACTIVE });
     ret.push({ name: '<span class=status-done>' + CoreTasks.STATUS_DONE.loc() + '</span>', value: CoreTasks.STATUS_DONE });
     return ret;
  }
});
  
Tasks.projectEditorPage = SC.Page.create({
  
  // TODO: [SC] remove hack below to create/destroy project editor panel to make text field views get updated properly after remove() is called
  popup: function(project) {
    this.panel = this.panelView.create();
    this.panel.popup(project);
  },
  
  panel: null,
  panelView: SCUI.ModalPane.extend({

    project: null,
    titleBarHeight: 40,
    minWidth: 700,
    minHeight: 250,

    layout: { centerX:0, centerY: 0, width: 700, height: 315 },

    _preEditing: function() {
      var project = this.get('project');
      // console.log('DEBUG: preEditing project: ' + project.get('name'));
      this.set('title', "_Project".loc() + ' ' + project.get('displayId'));
      var editor = this.get('contentView');
      editor.setPath('nameField.value', project.get('name'));
      if(CoreTasks.getPath('permissions.canUpdateProject')) {
        this.invokeLater(function() { Tasks.getPath('projectEditorPage.panel.contentView.nameField').becomeFirstResponder(); }, 400);
      }
      editor.setPath('statusField.value', project.get('developmentStatusValue'));
      editor.setPath('timeLeftField.value', project.get('timeLeftValue'));
      editor.setPath('activatedAtField.date', project.get('activatedAtValue'));
      editor.setPath('descriptionField.value', project.get('description'));
      editor.setPath('createdAtLabel.value', project.get('displayCreatedAt'));
      editor.setPath('updatedAtLabel.value', project.get('displayUpdatedAt'));
    },

    _postEditing: function() {
      var project = this.get('project');
      // console.log('DEBUG: postEditing project: ' + project.get('name'));
      var editor = this.get('contentView');
      if(editor.getPath('nameField.value') === CoreTasks.NEW_PROJECT_NAME.loc()) {
        project.destroy(); // blow away unmodified new project
        Tasks.projectsController.selectObject(CoreTasks.get('allTasksProject'));
      }
      else {
        project.setIfChanged('developmentStatusValue', editor.getPath('statusField.value'));
        var oldTimeLeft = project.get('timeLeftValue');
        project.setIfChanged('timeLeftValue', editor.getPath('timeLeftField.value'));
        var oldActivatedAt = project.get('activatedAtValue');
        project.setIfChanged('activatedAtValue', editor.getPath('activatedAtField.date'));
        project.setIfChanged('displayName', editor.getPath('nameField.value'));
        project.setIfChanged('description',  editor.getPath('descriptionField.value'));
        // If timeLeft or activatedAt has changed, recalculate load balancing
        if(oldTimeLeft !== project.get('timeLeftValue') || oldActivatedAt !== project.get('activatedAtValue')) {
          // console.log('DEBUG: need to redraw assignments since project timeLeft or activatedAt changed');
          Tasks.assignmentsController.computeTasks();
        }
      }
    },

    popup: function(project) {
      Tasks.statechart.sendEvent('showProjectEditor');
      this.set('project', project);
      this._preEditing();
      this.append();
    },

    remove: function() {
      this._postEditing();
      if(CoreTasks.get('autoSave') && !CoreTasks.get('isSaving')) Tasks.saveChanges();
      this.invokeLater(function() { Tasks.mainPage.getPath('mainPane.projectsList').becomeFirstResponder(); }, 400);
      sc_super();
      this.destroy();
    },

    contentView: SC.View.design({
      childViews: 'nameLabel nameField statusLabel statusField timeLeftLabel timeLeftField timeLeftHelpLabel activatedAtLabel activatedAtField descriptionLabel descriptionField createdAtLabel updatedAtLabel closeButton'.w(),

      nameLabel: SC.LabelView.design({
        layout: { top: 6, left: 10, height: 24, width: 60 },
        textAlign: SC.ALIGN_RIGHT,
        value: "_Name".loc()
      }),
      nameField: SC.TextFieldView.design({
        layout: { top: 5, left: 75, right: 200, height: 24 },
        isEnabledBinding: 'CoreTasks.permissions.canUpdateProject'
      }),

      statusLabel: SC.LabelView.design({
        layout: { top: 7, right: 113, height: 24, width: 50 },
        textAlign: SC.ALIGN_RIGHT,
        value: "_Status".loc()
      }),
      statusField: SC.SelectButtonView.design({
        layout: { top: 5, right: 10, height: 24, width: 125 },
        classNames: ['square'],
        localize: YES,
        isEnabledBinding: 'CoreTasks.permissions.canUpdateProject',
        objects: Tasks.projectEditorHelper.listStatuses(),
        nameKey: 'name',
        valueKey: 'value',
        toolTip: "_StatusTooltip".loc()
      }),

      timeLeftLabel: SC.LabelView.design({
        layout: { top: 40, left: 10, height: 24, width: 60 },
        textAlign: SC.ALIGN_RIGHT,
        value: "_TimeLeft:".loc()
      }),
      timeLeftField: SC.TextFieldView.design({
        layout: { top: 37, left: 75, width: 80, height: 24 },
        isEnabledBinding: 'CoreTasks.permissions.canUpdateProject'
      }),
      timeLeftHelpLabel: SC.LabelView.design({
        layout: { top: 45, left: 165, height: 20, width: 330 },
        escapeHTML: NO,
        classNames: [ 'onscreen-help'],
        value: "_TimeLeftOnscreenHelp".loc()
      }),

      activatedAtLabel: SC.LabelView.design({
        layout: { top: 40, right: 113, height: 24, width: 100 },
        textAlign: SC.ALIGN_RIGHT,
        value: "_Activated:".loc()
      }),
      // TODO: [SG/EG] allow SCUI.DatePickerView popup picker height to be adjustable, not hardcoded to 255
      activatedAtField: SCUI.DatePickerView.design({
        layout: { top: 37, right: 10, height: 24, width: 100 },
        dateFormat: CoreTasks.DATE_FORMAT,
        hint: "_ChooseDate".loc(),
        isEnabledBinding: 'CoreTasks.permissions.canUpdateProject'
      }),

      descriptionLabel: SC.LabelView.design({
        layout: { top: 70, left: 10, height: 17, width: 100 },
        icon: 'description-icon',
        value: "_Description:".loc()
      }),
      descriptionField: SC.TextFieldView.design({
        layout: { top: 95, left: 10, right: 10, bottom: 65 },
        hint: "_DescriptionHint".loc(),
        maxLength: 500000,
        isTextArea: YES,
        isEnabledBinding: 'CoreTasks.permissions.canUpdateProject'
      }),
      
      createdAtLabel: SC.LabelView.design({
        layout: { left: 10, bottom: 45, height: 17, width: 250 },
        classNames: [ 'date-time'],
        textAlign: SC.ALIGN_LEFT
      }),
      updatedAtLabel: SC.LabelView.design({
        layout: { right: 10, bottom: 45, height: 17, width: 250 },
        classNames: [ 'date-time'],
        textAlign: SC.ALIGN_RIGHT
      }),

      closeButton: SC.ButtonView.design({
        layout: { bottom: 10, right: 20, width: 80, height: 24 },
        isDefault: YES,
        title: "_Close".loc(),
        action: 'close'
      })

    })

  })
  
});
