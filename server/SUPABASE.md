This file is for installing SUPABASE Locally

First there is a need to install Docker

Use the website to download the right thing

- Install Docker Desktop
- Download from Docker Desktop for Windows.
- https://docs.docker.com/desktop/setup/install/windows-install/
- During setup, make sure “Use WSL 2 based engine” is checked (recommended).
- Restart your computer after installation.

If you do not have Linux it will ask you to download it also. 
Once download it it will lead you to download just follow the instructions.

First to install we need to install supabase in dev.
Use the comand in git bash

npm install supabase --save-dev

Then Intitiallize supabse

npx supabase init

this will create a folder for supabase. Keep in mind if docker is not install it will not load the commans.

Onces done use 

npx supabase start

This might take a minute but just follow intructions untill started.

Once done you should be able to locally run supabase and you're done!

Add the tables that you need and you can start using it.

