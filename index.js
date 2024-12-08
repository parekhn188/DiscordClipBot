import 'dotenv/config.js';
import NodeCache from 'node-cache';
import { DiscordRequest, handleResponse } from './auth.js';
import { InteractionResponseType, InteractionType } from 'discord-interactions';
import {
  parseClipInformation,
  parseInteraction,
  searchClip,
  sendPage,
} from './db.mjs';

// Globals for pagination
const cache = new NodeCache();
let startIndex = 0;
const pageSize = 5;

/*
 * Handle Interactions using interactions endpoint
 */
export const handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body);
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid request body' }),
    };
  }
  // console.log(body);
  const { type, data, channel } = body;
  const { id, last_message_id } = channel;
  const custom_id = data ? data['custom_id'] : null;

  // Handle ACK
  if (type === InteractionType.PING) {
    return {
      statusCode: 200,
      body: JSON.stringify({ type: InteractionResponseType.PONG }),
    };
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

      return {
        statusCode: 200,
        body: JSON.stringify({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `_${resp}_`,
          },
        }),
      };
    } else if (cmd === 'clipsearch') {
      const searchResp = await searchClip(...data['options']);
      const urlArr = searchResp.map((clip) => clip['url']);

      // Pagination Logic
      const response = sendPage(startIndex, pageSize, urlArr, searchResp);

      // Add current set of variables to the cache
      cache.set('cacheKey', {
        startIndex,
        pageSize,
        urlArr,
        searchResp,
      });

      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };
    }
  } else if (
    type === InteractionType.MESSAGE_COMPONENT &&
    custom_id === 'next_page_button'
  ) {
    let { startIndex, pageSize, urlArr, searchResp } = cache.get('cacheKey');
    startIndex += pageSize;

    const response = sendPage(startIndex, pageSize, urlArr, searchResp);

    cache.set('cacheKey', {
      startIndex,
      pageSize,
      urlArr,
      searchResp,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Unhandled Interaction' }),
  };
};
