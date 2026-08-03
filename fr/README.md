# Exemple d'application du portail de développement pour le flux de code de l'appareil.

Cet exemple montre comment utiliser la bibliothèque openid-client avec Node.js pour :
- Authentifier un utilisateur via openid-client en utilisant le type de subvention d'autorisation du flux de périphériques.
- Effectuer avec succès une requête API vers le point de terminaison `userinfo` pour renvoyer les détails de l'utilisateur authentifié.

## Exécution de l'exemple d'application :
1. Configurez les variables de votre fichier `.env`. Vous pouvez vous référer au fichier `.env.example` avec les variables requises pour exécuter cet exemple.
3. Dans l'interface de gestion, entrez `npm install`
4. Après avoir installé node_modules avec succès, démarrez l'application d'exemple à partir de l'interface de gestion en exécutant la commande suivante `npm run start`
4. accédez à `http://localhost:3000` dans votre navigateur et suivez les instructions à l'écran pour authentifier votre application à l'aide du type de subvention d'authentification du flux de l'appareil avec IBM Security Verify.

## Flux d'utilisateurs
- Cliquez sur le bouton `Device code` pour appeler le serveur d'autorisation afin de récupérer un code d'appareil valide.
- Copiez le code et cliquez sur le lien fourni pour vous authentifier à l'aide du code de l'appareil
- L'application commence à interroger le serveur d'autorisation pour obtenir un jeton d'accès valide
- Lorsque le processus d'authentification est terminé, vous pouvez consulter les informations relatives aux utilisateurs authentifiés.

![capture d'écran](screenshot.png)

## Traitement des incidents
- L'ITC affiche `npm ERR! code E401` alors que l'on essaie d'exécuter `npm install`. Supprimez le fichier package-lock.json et relancez `npm install`.


## Licence

La licence MIT (MIT)

Copyright (c) 2023 - IBM Corp.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
<!-- v2.3.7 : caits-prod-app-gp_webui_20241231T140321-21_en_fr -->