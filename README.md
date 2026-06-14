# OpenStave

Extensible monolithic server for STA races.

## Supported games

* Super Mario Bros. 
    * Any%
    * Warpless
* Super Mario Bros. 2 (Japan)
    * Any%
    * Warpless
* Super Mario Bros. 3
    * Any% No Wrong Warp

## Hosting

The public instance is hosted at <https://openstave.ca/>. Contact `silverslither_` on Discord to obtain the race key.

To host OpenStave, create the `env.ts` file in the repo root with the same format as `env.ts.example`. Then, launch with `node server.ts` (tested on Node 24).

## Usage

### Renderer Controls

* Left click: cycle player (main screen), focus player (leaderboard)
* Middle click: reset to focus first place
* Right click: cycle placement (main screen), focus placement (leaderboard)

### Race Creation

On the homepage, fill out all form elements and click Submit to start a new race. You will see the race ID be appended to the end of your URL, and the current status of all players will be printed below the links to the user scripts. Once all user scripts have been distributed (e.g. in a private channel visible to only runners), you may safely reload the page, and the current race status will keep printing under the form (which can still be submitted).

### Running user scripts in Mesen2

`Debug > Script Window` opens a new Lua script window. From within the script window, open `Script > Settings`, and enable:
* Allow access to I/O and OS functions
* Allow network access

Note: with these settings enabled, be careful to not run any scripts from unknown or untrustworthy sources. It is best to inspect all scripts for suspicious looking code.

Then, to run a script, simply `File > Open` the script you wish to run (if necessary, click the triangle icon to run the script - the default settings automatically execute loaded scripts). If it is an OpenStave user script, you should see `[OpenStave] successfully connected` printed to the Mesen2 screen as well as the console in the script window. If an error message is printed, follow the instructions in the error message.

### Using the recorder feature

Before starting your recording, resize your browser to get your desired output resolution (smaller window sizes work well because the height of the video is constant). Do not resize your browser window in the middle of a recording.

All frames rendered after you start your recording will be recorded. Additionally, seeking is disabled when the recorder is active. This means that once you start your recording, you may safely find the exact frame you wish to start on, and then unpause to begin recording from that frame onwards.

The output codec is VP9, inside the Duck IVF container. FFmpeg natively supports decoding videos in this format. Before performing any long recordings, make sure that your browser is capable of outputting lossless VP9 by running a short recording through `ffprobe` (you should see `vp9 (Profile 1)` and `yuv444p`). Currently, lossless VP9 has been confirmed to work on Chromium on Linux.

It is recommended to remux to WebM for compatibility with editing software, or upscale the output by at least 2x using `flags=neighbor` if `ffmpeg` alone is being used to process the output.

## Special Thanks

* 100th_Coin, for generating all SMB3 level maps and helping me work with the SMB3 codebase
