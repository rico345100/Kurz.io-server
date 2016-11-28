![Image of Kurz.io](http://photon.modernator.me:/album/rico345100@gmail.com/git/kurzio/noti.png)

# Kurz.io - Server
Realtime chat app built by Electron + React + Redux.

## Run
1. Install deps

```bash
$ npm Install
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
![Screenshot2](http://photon.modernator.me:/album/rico345100@gmail.com/git/kurzio/2.png)
![Screenshot1](http://photon.modernator.me:/album/rico345100@gmail.com/git/kurzio/1.png)