import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthModule (e2e)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: true
      })
    );
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should handle the full auth flow', async () => {
    const credentials = { email: 'merchant@example.com', password: 'averysecurepassword' };

    const signupResponse = await request(server).post('/auth/signup').send(credentials).expect(201);
    expect(signupResponse.body).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({ email: credentials.email, id: expect.any(String) }),
        accessToken: expect.any(String),
        refreshToken: expect.any(String)
      })
    );

    await request(server).post('/auth/signup').send(credentials).expect(409);

    await request(server)
      .post('/auth/login')
      .send({ ...credentials, password: 'wrongpassword123' })
      .expect(401);

    const loginResponse = await request(server).post('/auth/login').send(credentials).expect(200);
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    expect(loginResponse.body.refreshToken).toEqual(expect.any(String));
    const firstRefreshToken: string = loginResponse.body.refreshToken;

    const refreshedResponse = await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    expect(refreshedResponse.body.refreshToken).toEqual(expect.any(String));
    expect(refreshedResponse.body.refreshToken).not.toEqual(firstRefreshToken);

    await request(server)
      .post('/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(401);

    const latestRefreshToken: string = refreshedResponse.body.refreshToken;
    await request(server).post('/auth/logout').send({ refreshToken: latestRefreshToken }).expect(200);

    await request(server).post('/auth/refresh').send({ refreshToken: latestRefreshToken }).expect(401);
  });
});
