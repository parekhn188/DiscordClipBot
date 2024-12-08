import postgres from 'postgres';
import { InteractionResponseType } from 'discord-interactions';

//sanitize inputs
// const sql = postgres('postgres://nisarg:sudo@127.0.0.1:5432/labeldb');
const sql = postgres({
  host: process.env.RDS_HOSTNAME,
  port: 5432,
  database: process.env.RDS_DB_NAME,
  username: process.env.RDS_USERNAME,
  password: process.env.RDS_PASSWORD,
  ssl: 'require',
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
  const all = await sql`
      select 
        *
      from "clipSchema".cliptable
    `;
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
  const [clipsaved] = await sql.begin(async (sql) => {
    const [clip] = await sql`
        insert into "clipSchema".cliptable (
          url, description, game, "timestamp", submitter, messageid
        ) values (
          ${url}, ${description}, ${game}, ${timestamp}, ${submitter}, ${messageid}
        )
        returning *
      `;
    return [clip];
  });
  return clipsaved;
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

export default sql;
