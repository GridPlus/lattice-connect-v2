<img src="assets/banner.png" />

# 👋 Introduction
This open-source project provides [Lattice<sup>1</sup>](https://gridplus.io/lattice) owners a HTTP server which they manage themselves, and that will proxy all messages between the device over their own local network, as an alternative to relying on the vendor-provided routing service. 

By default, communication between apps and a Lattice<sup>1</sup> route through cloud infrastructure provided by [GridPlus](https://gridplus.io). Any messages sent to, and from, your device will always be encrypted and remain secure; however, we believe Lattice<sup>1</sup> owners should be able to manage this service themselves, if they so choose.
### 🔗 Related Links
 - [📢 Discord](https://twitter.com/gridplus)
 - [🐤 Twitter](https://discord.gg/Bt5fVDTJb9)
 - [📚 Knowledge Base](https://docs.gridplus.io)
&nbsp;
## 🤔 Why use Lattice Connect?

Running _Lattice Connect_ yourself provides several advantages:

 - Doesn't requires running an external MQTT broker (compared to `v1`);
 - Offers the fastest message routing possible for a Lattice<sup>1</sup>;
 - Provides the highest amount of privacy available while using a Lattice<sup>1</sup>;
 - Zero configuration changes required (i.e., no SSH'ing necessary);
 - Setup takes less than 5 minutes!

## 🚨 What about `v1`?
This project replaces the original _[lattice-connect](https://github.com/GridPlus/lattice-connect)_, which is now archived. 

At the time of release, the previous software should continue working as-is; however, GridPlus will no longer offer technical support, or otherwise provide maintenance for the prior version. Thus, breaking changes that may occur as we continue improving our customers' user experience should be expected, and switching to `v2` as soon as possible is highly recommended.

# ⌛️ Setup Guide

It's possible to run the server:

 - directly on a host system using `node` v14+; or,
 - through a `Docker` container.

> _**NOTE:** The instructions for each are nearly identical. This guide describes `node`;
scripts are provided in `connect/container` that support the `Docker` method._

##### Estimated Time (TOTAL): 5–10 minutes
##### Overview of steps are:

 1. Configuring, then running, `lattice-connect-v2`; and,
 2. Downloading, and installing, _[Frame](https://frame.sh)_; and,
 3. Setting your _Lattice Relayer_ host in _Frame_; and,
 4. Connecting your Lattice<sup>1</sup> to the _Frame_ app.
## ▶️ Configuring & Running
#### Get the source code
Clone the repo to the server or computer you plan to run it on:

 ```sh
 # Clone the repo:
$ git clone https://github.com/GridPlus/lattice-connect-v2.git

# Change your working director to the 'connect' folder:
$ cd lattice-connect-v2/connect
```

#### Configure the environment
Edit `connect/.direct.env` and set your device's hostname: 

```sh
# - Open the '.direct.env' file; then,
# - Replace this with your device's hostname 
ADMIN_CLIENT_HOST=http://GridPlus-xxxxxxxxxxx.local 
```
##### Checking your device's hostname
On Firmware v16, and above, the device's hostname is shown with the following steps:

 1. **Unlock** the device; then,
 2. Tap **System Preferences**; then,
 3. Tap **Device Info**; then,
 4. See `SSH Host`.
#### Build and start the server
From inside `connect` folder, run: 

```sh
# Install dependencies
$ npm i 

# Start the proxy
$ npm run start:direct

# Look for confirmation...
... [!] MQTT client connected
```

<img src="assets/start-direct.gif" />

##### Troubleshooting 

If the server fails to connect:

 - Double-check your `ADMIN_CLIENT_HOST` value;
 - Ensure `.local` is included as as suffix on the host;
 - `ping` your device; be certain your device is reachable outside this context.

## 🖼 Frame Wallet

<img src="assets/frame-install.png" />

 Download [Frame](https://frame.sh) wallet desktop app, and run the installer.

#### Set the Lattice Relay

From the _Settings_ panel (upper-right; slider icon):

 - Scroll down to the **Lattice Relay** option; then,
 - Click _Default_; switch to _Custom_; then,
 - Input the `http://<RELAY_HOST>:8080`

Replace `RELAY_HOST` with the host running _Lattice Connect_.
When running _Frame_ and _Lattice Connect_ on the same computer, use `localhost`:

<img src="assets/lattice-relay.png" />

## FAQ

### Can I use _Lattice Connect_ with MetaMask?
### How do I connect more than one Lattice<sup>1</sup>?
