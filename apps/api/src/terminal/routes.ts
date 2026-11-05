import express from 'express';
import { z } from 'zod';
import { activateTerminal, authenticateTerminal, authorizeTerminalPayment, confirmTerminalCredentialRotation, createTerminalPayment, getTerminalPayment, startTerminalCredentialRotation, TerminalError } from './service.js';

export const terminalRouter=express.Router();
terminalRouter.post('/activate',async(req,res,next)=>{try{res.json(await activateTerminal(String(req.body?.code??'')));}catch(e){next(e);}});
terminalRouter.post('/credentials/rotations/:id/confirm',async(req,res,next)=>{try{res.json(await confirmTerminalCredentialRotation(String(req.get('x-oynk-terminal-id')??''),String(req.params.id),String(req.get('x-oynk-terminal-secret')??'')));}catch(e){next(e);}});
terminalRouter.use(async(req,res,next)=>{try{res.locals.terminal=await authenticateTerminal(req.get('x-oynk-terminal-id'),req.get('x-oynk-terminal-secret'));next();}catch(e){next(e);}});
terminalRouter.get('/status',(_req,res)=>{const terminal=res.locals.terminal;res.json({ok:true,terminalId:terminal.id,status:terminal.status});});
terminalRouter.post('/credentials/rotations',async(_req,res,next)=>{try{res.status(201).json(await startTerminalCredentialRotation(res.locals.terminal));}catch(e){next(e);}});
terminalRouter.post('/payments',async(req,res,next)=>{try{const parsed=z.object({customer:z.string().min(3).max(80),amountKobo:z.string().regex(/^\d+$/),idempotencyKey:z.string().min(16).max(160)}).parse(req.body);res.status(201).json(await createTerminalPayment(res.locals.terminal,parsed));}catch(e){next(e);}});
terminalRouter.post('/payments/:id/authorize',async(req,res,next)=>{try{res.json(await authorizeTerminalPayment(res.locals.terminal,String(req.params.id),String(req.body?.pin??'')));}catch(e){next(e);}});
terminalRouter.get('/payments/:id',async(req,res,next)=>{try{res.json(await getTerminalPayment(res.locals.terminal,String(req.params.id)));}catch(e){next(e);}});
terminalRouter.use((error:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(error instanceof TerminalError){res.status(error.status).json({message:error.message,code:error.code});return;}if(error instanceof z.ZodError){res.status(400).json({message:'Review the payment details.',code:'VALIDATION_ERROR'});return;}console.error('[terminal] request failed',{message:error instanceof Error?error.message:'Unknown error'});res.status(503).json({message:'The terminal service could not complete the request. Check the payment status before trying again.',code:'TERMINAL_UNAVAILABLE'});});
