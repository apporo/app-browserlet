# app-browserlet test/app

## Usage

### Electron dependencies

```shell
sudo apt-get install build-essential clang libdbus-1-dev libgtk2.0-dev \
                   libnotify-dev libgnome-keyring-dev libgconf2-dev \
                   libasound2-dev libcap-dev libcups2-dev libxtst-dev \
                   libxss1 libnss3-dev gcc-multilib g++-multilib curl \
                   gperf bison
```

[Build Instructions (Linux)](https://github.com/electron/electron/blob/master/docs/development/build-instructions-linux.md)

or
[docker-tape-run/Dockerfile](https://github.com/fraserxu/docker-tape-run/blob/master/Dockerfile)

### Run

```shell
$ DEBUG=devebot*,app* node test/app
```
