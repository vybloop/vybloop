After completing a task, delete it from this file.

* We need to adjust the layout of the project screen so that the terminal takes the full height of the viewport. Right now it only takes the height of the sidebar. The sidebar should also independently scroll. AT the same time, we should adjust the layout on mobile so that the sidebar transforms into another tab when the layout is too narrow, because otherwise it leaves no room for the terminal window. Mobile screens should also have a much more minimal header that can combine with the tabs, probably just the app icon that links back to the main page.

* Mobile browsers (both firefox and chrome) don't seem to be using the right font in the terminal. Or at least some of the extended characters don't seem to be rendering, so I assume it's a typeface issue. Maybe look for a different way to load the font that's more likely to work on mobile.

* The terminal screen size seems to be wrong until the page gets resized once. We should send a resize event after the terminal is loaded to make sure it's in sync.