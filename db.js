import { createClient } from '@supabase/supabase-js';
import { InteractionResponseType } from 'discord-interactions';

// File upload libraries
import axios from 'axios';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Sufy Object Storage
const s3 = new S3Client({
  region: process.env.AWS_REGION, // US South
  endpoint: process.env.AWS_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export function parseInteraction(data) {
  const descriptionOption = data['options'][0];
  const tagOption = data['options'][1];

  const descriptions = descriptionOption['value']
    .split(',')
    .map((val) => val.trim());
  const tags = tagOption['value'].split(',').map((val) => val.trim());

  const clips = [];

  for (let i = 0; i < Math.min(descriptions.length, tags.length); i++) {
    const description = descriptions[i];
    const tag = tags[i];
    clips.push({ description, tag });
  }

  return clips;
}

export function parseClipInformation(reqRes) {
  const clips = [];
  const submitter = reqRes['author']['username'];

  for (const attachment of reqRes['attachments']) {
    const url = attachment['url'];
    const timestamp = reqRes['timestamp'];
    const messageid = attachment['id'];
    clips.push({ submitter, url, timestamp, messageid });
  }

  return clips;
}

// DB Functions
export async function getAll() {
  const all = await supabase.from('clips').select('*');
  return all;
}

export async function insertClipData(
  url,
  description,
  game,
  timestamp,
  submitter,
  messageid
) {
  try {
    const clipsaved = await supabase.from('clips').insert([
      {
        url: url,
        description: description,
        game: game,
        timestamp: timestamp,
        submitter: submitter,
        messageid: messageid,
      },
    ]);

    return clipsaved;
  } catch (error) {
    console.error('Supabase insert error:', error);
  }
}

// search for clips
export async function searchClip(...args) {
  const sqlArgs = args.reduce((accumulator, arg) => {
    accumulator[arg['name']] = arg['value'];
    return accumulator;
  }, {});

  const dynamicQ = (arg) => (arg ? `%${arg}%` : '%');

  const clips = await sql`select * from "clipSchema".cliptable where (${sql(
    'description'
  )} ILIKE ${dynamicQ(sqlArgs['description'])})`;

  return clips;
}

// SendPage function for pagination
export function sendPage(res, startIndex, pageSize, urlArr, searchResp) {
  const endIndex = Math.min(startIndex + pageSize, urlArr.length);
  let message = '';

  for (let i = startIndex; i < endIndex; i++) {
    message += `_Found clip(s) with label: ${searchResp[i]['description']} \n ${urlArr[i]}_\n`;
  }

  if (urlArr.length <= pageSize || urlArr.length - startIndex <= pageSize) {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: message !== '' ? message : 'Clip(s) not found',
      },
    });
  } else {
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: message,
        components: [
          {
            type: 1, // Button component
            components: [
              {
                type: 2, // Button
                style: 1,
                label: 'Next Clip Set',
                custom_id: 'next_page_button',
              },
            ],
          },
        ],
      },
    });
  }
}

async function downloadClip(url, messageid) {
  try {
    const response = await axios({
      url, // File URL from Discord
      method: 'GET', // HTTP GET request
      responseType: 'stream', // Stream the response
    });

    return response.data;
  } catch (error) {
    console.error(
      `Error downloading clip for message ID ${messageid}: ${error}`
    );
  }
}

export async function blobUpload(url, messageid) {
  const signedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: 'clips.mos.us-south-1.sufybkt.com',
      Key: process.env.AWS_BUCKET_KEY,
    }),
    {
      expiresIn: 60 * 60 * 24, // 1 day
    }
  );

  if (!signedUrl) {
    console.log('Error getting signed url');
    return;
  }

  // We have a signed url download the clip
  const clip = await downloadClip(url, messageid);
  if (!clip) {
    console.log('Error downloading clip');
    return;
  }

  // Fire-and-forget upload
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: 'clips',
      Key: `${messageid}.mp4`,
      Body: clip,
      ContentType: 'video/mp4',
    },
  });

  upload.on('httpUploadProgress', (progress) => {
    console.log(`Progress: ${progress.loaded} bytes uploaded`);
  });

  // Use .then() and .catch() to handle upload separately
  upload
    .done()
    .then((data) => {
      console.log('Upload successful:', data);
    })
    .catch((err) => {
      console.error('Error uploading file:', err);
    });

  return `${process.env.AWS_ENDPOINT}/clips/${messageid}.mp4`;
}

export default blobUpload;
