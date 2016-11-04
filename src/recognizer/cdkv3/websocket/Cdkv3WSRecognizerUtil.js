import * as NetworkWSInterface from '../../networkHelper/websocket/networkWSInterface';
import { recognizerLogger as logger } from '../../../configuration/LoggerConfig';
import * as Cdkv3WSWebsocketBuilder from './Cdkv3WSBuilder';
import * as PromiseHelper from '../../../util/PromiseHelper';
import * as InkModel from '../../../model/InkModel';


function buildUrl(paperOptions, suffixUrl) {
  const scheme = (paperOptions.recognitionParams.server.scheme === 'https') ? 'wss' : 'ws';
  return scheme + '://' + paperOptions.recognitionParams.server.host + suffixUrl;
}


function send(recognizerContextParam, recognitionContextParam) {
  const recognizerContextReference = recognizerContextParam;
  const recognitionContext = recognitionContextParam;

  logger.debug('Recognizer is alive. Sending last stroke');

  // In websocket the last stroke is getLastPendingStrokeAsJsonArray as soon as possible to the server.
  const strokes = InkModel.getLastPendingStrokeAsJsonArray(recognitionContext.model);
  recognizerContextReference.recognitionContexts.push(recognitionContext);

  if (recognizerContextReference.recognitionIdx === 0) {
    recognizerContextReference.recognitionIdx++;
    NetworkWSInterface.send(recognizerContextReference.websocket, recognitionContext.buildStartInputFunction(recognitionContext.paperOptions, strokes));
  } else {
    NetworkWSInterface.send(recognizerContextReference.websocket, recognitionContext.buildContinueInputFunction(strokes));
  }
}

/**
 * Init the websocket recognizer.
 * Open the connexion and proced to the hmac challenge.
 * A recognizer context is build as such :
 * @param url
 * @param paperOptionsParam
 * @param recognizerContext
 * @returns {Promise} Fulfilled when the init phase is over.
 */
export function init(suffixUrl, paperOptionsParam, recognizerContext) {
  const paperOptionsReference = paperOptionsParam;
  const recognizerContextReference = recognizerContext;
  const url = buildUrl(paperOptionsParam, suffixUrl);
  const destructuredInitPromise = PromiseHelper.destructurePromise();

  logger.debug('Opening the websocket for context ', recognizerContextReference);
  const initCallback = Cdkv3WSWebsocketBuilder.buildWebSocketCallback(destructuredInitPromise, recognizerContextReference, paperOptionsReference);
  recognizerContextReference.websocket = NetworkWSInterface.openWebSocket(url, initCallback);
  recognizerContextReference.recognitionContexts = [];
  recognizerContextReference.recognitionIdx = 0;

  // Feeding the recognitionContext
  recognizerContextReference.initPromise = destructuredInitPromise.promise;

  destructuredInitPromise.promise.then(
      (value) => {
        logger.debug('Init over ' + value);
      }
  ).catch(
      (error) => {
        logger.error('fatal error while loading recognizer');
      }
  );
  return recognizerContextReference.initPromise;
}

export function recognize(paperOptionsParam, recognizerContext, modelParam, buildStartInputFunction, buildContinueInputFunction, processResultFunction) {
  const destructuredRecognitionPromise = PromiseHelper.destructurePromise();

  const recognizerContextReference = recognizerContext;
  if (!recognizerContextReference.awaitingRecognitions) {
    recognizerContextReference.awaitingRecognitions = [];
  }
  // Building an object with all mandatory fields to feed the recogntion queue.
  const recognitionContext = {
    buildStartInputFunction,
    buildContinueInputFunction,
    processResultFunction,
    model: modelParam,
    paperOptions: paperOptionsParam,
    recognitionPromiseCallbacks: destructuredRecognitionPromise
  };
  recognizerContextReference.initPromise.then(() => {
    logger.debug('Init was done feeding the recognition queue');
    send(recognizerContextReference, recognitionContext);
  });
  return destructuredRecognitionPromise.promise;
}

/**
 * Clear server context. Currently nothing to do there.
 * @paperOptionsParam
 * @modelParam
 */
export function reset(paperOptionsParam, modelParam) {
  if (modelParam.recognitionContext && modelParam.recognitionContext.websocket) {
    NetworkWSInterface.send(modelParam.recognitionContext.websocket, { type: 'reset' });
  }
}

/**
 * Close and free all ressources that will no longuer be used by the recognizer.
 * @param paperOptionsParam
 * @param modelParam
 */
export function close(paperOptionsParam, modelParam) {
  const modelReference = modelParam;
  if (modelReference.recognitionContext && modelReference.recognitionContext.websocket) {
    NetworkWSInterface.close(modelReference.recognitionContext.websocket, 1000, 'CLEAR');
  }
}

