# APLOSE Annotator User Guide

[TOC]

## Application overview

### Login

Login pages allow the user to authenticate to the website.<br />
There is currently no sign in feature: users are created by the website administrators, who send the credentials to the campaign manager or to the users.


Fig. 1: login screen capture

### Navigation

For data management pages, a menu area is displayed on the left side of the page. It gives access to Datasets overview, Campaigns overview, and a logout feature.


Fig. 2: navigation area screen capture

### Campaigns overview

Annotation campaigns page is an overview of all available campaigns for the user currently logged in.<br />
For each campaign, there is a link to the Task list at the end of the line.


Fig. 13: annotation campaigns screen capture

### Task list

The Annotation Tasks page lists the tasks for a given campaign, for the user currently logged in.

Column | Content
------ | -------
Filename | name of the task file
Dataset | short name of the dataset
Date | when this file was recorded
Duration | duration of the task file
Status | Created if the user hasn’t begun to annotate the file, Finished otherwise
Link | a link to the Audio Annotator page for this task


Fig. 17: task list screen capture

## Audio annotator

### Overview

Fig. 3: audio annotator overview

This is the main page of the site: it allows to annotate a spectrogram visualization of a sound file.<br />
The spectrogram is labelled with time and frequency axes.

If this task has been annotated and submitted previously, the application will load and display previous annotations. Like new ones, these annotations can be modified or deleted.

The sound file is playable by clicking on the play / pause button under the spectrogram. A thin black playback bar is displayed over the spectrogram.


Fig. 4: audio annotator play button, axes and playback bar screen capture

### Playback rate (only on Firefox)

The speed at which the sound file is played can be changed from a select list displayed (only on Firefox) next to the play button. Available speeds are 0.25x, 0.5x, 1x, 1.5x, 2x, 3x and 4x.<br />
There is no pitch correction so modifying the playback rate also modifies the frequency.


Fig. 5: audio annotator with playback rate controls screen capture

### Control panel / zoom

The control panel allows to change the way the spectrogram is displayed.<br />
With the select list, the user can choose the way the spectrogram was generated among available settings.

A zooming feature is available by two means:

- Clicking / tapping the buttons on the control panel: the spectrogram is centered on the progress bar
- Scrolling over the spectrogram with a mouse or a touch pad: the spectrogram is center on the cursor position

The spectrogram only zooms on time (no zoom on frequency). The zoom is discrete: each zoom level offers pre-computed spectrograms, meaning levels are decided by the creator of the dataset.


Fig. 6: control panel screen capture

### Create, tag, select and delete an annotation

To create an annotation, click on the spectrogram and drag over the area containing the feature.<br />
On click / tap release, the annotation is created and selected: it appears in Selected annotation block and in the Annotations list, both below the spectrogram.


Fig. 7: screen captures of annotation states: during creation / created / tagged

The selected annotation block gives precise details about the annotation: start and end time, min and max frequency. It also list available tags (from the dataset). To tag / untag the annotation, press the matching button. An annotation must have one and only one tag.


Fig. 8: selected annotation block screen capture

The selected annotation can be chosen by clicking on its header on the spectrogram, or its line on the annotation list.<br />
The header also allow playing the sound file only for the duration of the annotation, and deleting the annotation by pressing corresponding buttons.

### Annotation list

All the annotations created by the user for the current task are listed in the annotations list block, sorted by start time.

Table content:

- Start / end time
- Min / max frequency
- Tag, “-” if no tag has been selected yet

Clicking on an annotation selects it (it appears it the selected annotation block and can be tagged).


Fig. 9: annotations list block screen capture

### Submit / navigation

The Submit & load next recording button works this way:

- If several annotations are not tagged, it selects the first one, display an error message and stay on this task
- If all annotations are tagged (or if no annotation has been created), it saves them for this task, and loads the next available task
- If there is no next available task, the user is sent back to the task list for this campaign.


Fig. 10: submit button screen capture

Fig. 11: error message for untagged annotations screen capture
