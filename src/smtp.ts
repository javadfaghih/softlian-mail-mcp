import { connect as connectTls } from "node:tls";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

/** Connect by hostname so Cloudflare resolves the destination for the TLS socket. */
export function createSmtpTransport(host: string, auth?: { user: string; pass: string }) {
  const options: SMTPTransport.Options = {
    host,
    port: 465,
    secure: true,
    auth,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    getSocket(_options, callback) {
      // Nodemailer's DNS-to-IP connection fails in Workers for some destinations.
      // Supply a verified TLS socket, preserving the hostname for SNI and trust.
      const socket = connectTls({ host, servername: host, port: 465, rejectUnauthorized: true });
      const deadline = setTimeout(() => {
        socket.destroy(Object.assign(new Error("SMTP TLS connection timed out"), { code: "ETIMEDOUT" }));
      }, 10_000);
      const onError = (error: Error) => {
        clearTimeout(deadline);
        socket.removeListener("secureConnect", onSecure);
        socket.destroy();
        callback(error, undefined);
      };
      const onSecure = () => {
        clearTimeout(deadline);
        socket.removeListener("error", onError);
        callback(null, { connection: socket, secured: true });
      };
      socket.once("error", onError);
      socket.once("secureConnect", onSecure);
    },
  };
  return nodemailer.createTransport(options);
}
