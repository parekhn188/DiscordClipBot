import Bull from 'bull';
import Redis from 'ioredis';
import blobUpload from './db.js';

const redis = new Redis();

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

const uploadQueue = new Bull('clipUploadQ', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

uploadQueue.process(async (job) => {
  const { url, messageid } = job.data;
  console.log(job.data);
  const blobUrl = await blobUpload(url, messageid);
  return blobUrl;
});

uploadQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed with result: ${result}`);
});

uploadQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err.message}`);
});

export default uploadQueue;
