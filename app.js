import 'dotenv/config.js';
import NodeCache from 'node-cache';
import express from 'express';
import { DiscordRequest, handleResponse } from './auth.js';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  parseClipInformation,
  parseInteraction,
  searchClip,
  sendPage,
} from './db.js';

// express app
const app = express();
const PORT = process.env.PORT || 3000;

// Globals for pagination
const cache = new NodeCache();
let startIndex = 0;
const pageSize = 5;

/*
 * Handle Interactions using interactions endpoint
 */
app.post(
  '/interactions',
  verifyKeyMiddleware(process.env.PUBLIC_KEY),
  async function (req, res) {
    const { type, data } = req.body;
    const { id, last_message_id } = req.body['channel'];
    const custom_id = req.body['data']['custom_id'];

    // Handle ACK
    if (type === InteractionType.PING) {
      return res.send({ type: InteractionType.PONG });
    }

    // Handle Slash Cmd
    if (type === InteractionType.APPLICATION_COMMAND) {
      const cmd = data['name'];

      if (cmd === 'label') {
        //channel endpoint
        const msg_endpoint = `channels/${id}/messages/${last_message_id}`;
        const getResult = await (
          await DiscordRequest(msg_endpoint, { method: 'GET' })
        ).json();

        console.log(getResult);
        // parse clip information
        const clipArr = parseClipInformation(getResult);

        // parse interaction information
        const interactionArr = parseInteraction(data);

        // zip together the interaction and the clip arrays
        const parsedArr = interactionArr.map((element, index) => ({
          ...clipArr[index],
          ...element,
        }));

        // call response handler on all clips
        const responseArr = [];
        for (const parsedClip of parsedArr) {
          const handledRes = await handleResponse(
            parsedClip['url'],
            parsedClip['description'],
            parsedClip['tag'],
            parsedClip['timestamp'],
            parsedClip['submitter'],
            parsedClip['messageid']
          );
          responseArr.push(handledRes);
        }

        // assemble response string
        let resp = '';
        for (let i = 0; i < responseArr.length - 1; i++) {
          resp += responseArr[i] + ', ';
        }

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `_${resp}_`,
          },
        });
      } else if (cmd === 'clipsearch') {
        const searchResp = await searchClip(...data['options']);
        const urlArr = searchResp.map((clip) => clip['url']);

        // Pagination Logic
        sendPage(res, startIndex, pageSize, urlArr, searchResp);

        // Add current set of variables to the cache
        cache.set('cacheKey', {
          startIndex,
          pageSize,
          urlArr,
          searchResp,
        });
      }
    } else if (
      type === InteractionType.MESSAGE_COMPONENT &&
      custom_id === 'next_page_button'
    ) {
      let { startIndex, pageSize, urlArr, searchResp } = cache.get('cacheKey');
      startIndex += pageSize;

      sendPage(res, startIndex, pageSize, urlArr, searchResp);

      cache.set('cacheKey', {
        startIndex,
        pageSize,
        urlArr,
        searchResp,
      });
    }
  }
);

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
