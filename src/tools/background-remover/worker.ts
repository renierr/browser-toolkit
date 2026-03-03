import { removeBackground, type Config } from '@imgly/background-removal';

self.onmessage = async (event: MessageEvent) => {
  const { id, file, config } = event.data;

  const workerConfig: Config = {
    ...config,
    //publicPath: `${location.origin}/lib/imgly/background-removal-data/1.4.5/dist/`,
    progress: (key, current, total) => {
      if (key === 'compute:inference') {
        const progress = (current / total) * 100;
        self.postMessage({ id, status: 'progress', progress });
      }
    }
  };

  try {
    const result = await removeBackground(file, workerConfig);
    self.postMessage({ id, status: 'success', result });
  } catch (error) {
    console.error('Worker error:', error);
    self.postMessage({ id, status: 'error', error: (error as Error).message });
  }
};
