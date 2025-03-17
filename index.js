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
  getAll,
} from './db.js';

const app = express();

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
  async (req, res) => {
    if (!req.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const { type, data, channel } = req.body;
    const { id, last_message_id } = channel;
    const custom_id = data ? data['custom_id'] : null;

    // Validate required fields
    if (!type || !channel) {
      return res.status(400).send({
        error: 'Missing required fields: type or channel',
      });
    }

    if (!id || !last_message_id) {
      return res.status(400).send({
        error: 'Missing required channel fields: id or last_message_id',
      });
    }

    if (data && !data.name && !data.custom_id) {
      return res.status(400).send({
        error: 'Data object must contain either name or custom_id',
      });
    }

    // Handle ACK
    if (type === InteractionType.PING) {
      return res.send({
        status: 200,
        body: InteractionResponseType.PONG,
      });
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

        const clipArr = parseClipInformation(getResult);

        // parse interaction information
        const interactionArr = parseInteraction(data);

        // zip together the interaction and the clip arrays
        const parsedArr = interactionArr.map((element, index) => ({
          ...clipArr[index],
          ...element,
        }));

        const responseArr = await Promise.allSettled(
          parsedArr.map(async (parsedClip, index) => {
            console.log(`Processing clip ${index}`);
            const res = handleResponse(
              parsedClip['url'],
              parsedClip['description'],
              parsedClip['tag'],
              parsedClip['timestamp'],
              parsedClip['submitter'],
              parsedClip['messageid']
            );
            return res;
          })
        );

        let resp = '';
        for (let i = 0; i < responseArr.length; i++) {
          resp += `${responseArr[i].value}\n`;
        }

        console.log(resp);

        return res.status(200).json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `_${resp}_`,
          },
        });

        //   } else if (cmd === 'clipsearch') {
        //     const searchResp = await searchClip(...data['options']);
        //     const urlArr = searchResp.map((clip) => clip['url']);

        //     // Pagination Logic
        //     const response = sendPage(startIndex, pageSize, urlArr, searchResp);

        //     // Add current set of variables to the cache
        //     cache.set('cacheKey', {
        //       startIndex,
        //       pageSize,
        //       urlArr,
        //       searchResp,
        //     });

        //     return {
        //       statusCode: 200,
        //       body: JSON.stringify(response),
        //     };
        //   }
        // } else if (
        //   type === InteractionType.MESSAGE_COMPONENT &&
        //   custom_id === 'next_page_button'
        // ) {
        //   let { startIndex, pageSize, urlArr, searchResp } = cache.get('cacheKey');
        //   startIndex += pageSize;

        //   const response = sendPage(startIndex, pageSize, urlArr, searchResp);

        //   cache.set('cacheKey', {
        //     startIndex,
        //     pageSize,
        //     urlArr,
        //     searchResp,
        //   });

        //   return {
        //     statusCode: 200,
        //     body: JSON.stringify(response),
        //   };
        // }
        // return {
        //   statusCode: 200,
        //   body: JSON.stringify({ message: 'Unhandled Interaction' }),
        // };
      }
    }
  }
);

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
