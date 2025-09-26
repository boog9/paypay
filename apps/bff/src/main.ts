import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import { json } from "express";
import type { Request, Response, NextFunction } from "express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./modules/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  const webhookPrefix = "/api/webhooks";
  app.use(
    json({
      verify: (req: any, _res, buffer) => {
        req.rawBody = buffer.toString();
      }
    })
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );
  const origins = process.env.FRONTEND_ORIGIN?.split(",").filter(Boolean) ?? ["http://localhost:3000"];
  app.enableCors({
    origin: origins,
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-csrf-token"]
  });
  const csrf = csurf({
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  });
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(webhookPrefix) ? next() : csrf(req, res, next)
  );
  const server = app.getHttpAdapter().getInstance();
  server.get("/api/csrf-token", (req: Request & { csrfToken: () => string }, res: Response) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  const config = new DocumentBuilder()
    .setTitle("PayPay BFF")
    .setDescription("Proxy & orchestration layer for BTCPay Greenfield")
    .setVersion("0.1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🚀 BFF is running at http://0.0.0.0:${port}`);
}

bootstrap();
