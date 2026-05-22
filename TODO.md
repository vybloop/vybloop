After completing a task, delete it from this file.

* Mobile browsers (both firefox and chrome) don't seem to be using the right font in the terminal. Or at least some of the extended characters don't seem to be rendering, so I assume it's a typeface issue. Maybe look for a different way to load the font that's more likely to work on mobile.


* The keyboard shortcut hint for "Search projects..." is not correctly aligned in the search box, it's currently on the right side of the box but with a big empty space on the right.

HACKS

* The terminal screen size seems to be wrong until the page gets resized once. We should send a resize event after the terminal is connected to make sure it's in sync.
  * This is currently hacked around by putting a resize event 1 second after connection


* The virtual terminal is empty whenever you navigate to it after it's already started. Maybe we fix this by logging all data sent from the terminal and replay it for every new connection.
  - This is fixed with a hack to force a redraw 1 second later