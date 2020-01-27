![Kurz.io Title](/noti.png?raw=true "Title")

# Kurz.io - Server
Realtime chat app built by Electron + React + Redux. Check the [client](https://github.com/rico345100/Kurz.io-client) side too.

## Run
1. Install deps

```bash
$ npm install
```

2. Run server
```bash
$ node server
```

## Requires
- Node.js >= 4.x
- MongoDB >= 3.x

## Note
This application is not built for production usage, develop for studying purpose. It uses WebSocket to communicate realtime by Socket.io, saves each channels and messages into MongoDB.
Much of code are not good to see, because when I made this app, I was not experienced like these technologies.

## Bugs
Packaging for Windows Platform will not trigger notification properly, it is bug when using electron-packager.

## Screenshots
![Screenshot1](/2.png?raw=true "Screenshot1")
![Screenshot2](/1.png?raw=true "Screenshot2")

## Buy me a coffee!
Donations are big help for me to continue my development!

[![paypal](https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=PVXTU5FJNBLDS)
